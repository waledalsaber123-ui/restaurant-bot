import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

/* ========= الإعدادات المباشرة (تجنباً لخطأ ملف config المفقود) ========= */
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    GROUP_ID: "120363407952234395@g.us",
    SHEET_URL: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// ذاكرة الجلسات والرسائل لمنع التكرار
const SESSIONS = {};
const LAST_MESSAGE = {}; 

/* ========= وظيفة جلب سعر التوصيل من الشيت ========= */
async function getDeliveryPrice(areaName) {
    try {
        const res = await axios.get(SETTINGS.SHEET_URL);
        const data = await csv().fromString(res.data);
        // البحث عن تطابق اسم المنطقة داخل النص المرسل
        const zone = data.find(d => areaName.includes(d.area.trim()));
        return zone ? parseFloat(zone.price) : 0;
    } catch (e) { 
        console.log("خطأ في قراءة الشيت");
        return 0; 
    }
}

/* ========= وظيفة إرسال الرسائل لواتساب ========= */
async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, {
            chatId,
            message
        });
    } catch (e) { console.error("خطأ في إرسال واتساب"); }
}

/* ========= الواتساب ويب هوك (المعالج الرئيسي) ========= */
app.post("/webhook", async (req, res) => {
    // 1. الحل الجذري للتكرار: الرد فوراً بـ 200 لإعلام السيرفر بالاستلام
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم كافة أنواع النصوص (بما فيها الأجهزة المرتبطة) لحل مشكلة "في انتظار الرسالة"
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    if (!chatId || !text || chatId.includes("@g.us")) return;

    // 2. منع معالجة نفس الرسالة مرتين (Spam Protection)
    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    // 3. إدارة جلسة الطلب
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { items: [], area: "", delivery: 0, total: 0 };
    }
    const session = SESSIONS[chatId];

    // 4. برومبت النظام للذكاء الاصطناعي (المنيو والقواعد)
    const systemPrompt = `
    أنت بوت مطعم ذكي. المنيو: (كباب: 5د، شاورما: 3د، زنجر: 4د).
    مهمتك:
    - إذا طلب العميل وجبة، رد بـ: [ADD:اسم_الوجبة:الكمية].
    - إذا ذكر منطقة سكنية، رد بـ: [AREA:اسم_المنطقة].
    - إذا أراد التأكيد النهائي، رد بـ: [CONFIRM].
    - السلة الحالية للعميل: ${JSON.stringify(session.items)}.
    `;

    try {
        const aiRes = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        const content = aiRes.data.choices[0].message.content;

        // 5. معالجة أوامر الـ AI المستخرجة
        if (content.includes("[AREA:")) {
            const area = content.match(/\[AREA:(.*?)\]/)[1];
            session.area = area;
            session.delivery = await getDeliveryPrice(area);
        }

        if (content.includes("[ADD:")) {
            const match = content.match(/\[ADD:(.*?):(\d+)\]/);
            session.items.push({ name: match[1], qty: match[2] });
        }

        if (content.includes("[CONFIRM]")) {
            const summary = `🚨 طلب جديد مؤكد:\nالعميل: ${chatId}\nالمنطقة: ${session.area}\nالطلب: ${JSON.stringify(session.items)}\nالتوصيل: ${session.delivery}د`;
            await sendWA(SETTINGS.GROUP_ID, summary);
            await sendWA(chatId, "تم تأكيد طلبك بنجاح ✅");
            delete SESSIONS[chatId]; // تصفير الجلسة
            return;
        }

        // 6. إرسال الرد النصي "النظيف" للعميل
        const cleanReply = content.replace(/\[.*?\]/g, "").trim();
        await sendWA(chatId, cleanReply);

    } catch (e) {
        console.error("AI Runtime Error");
        await sendWA(chatId, "أهلاً بك! كيف بقدر أساعدك بالطلب؟");
    }
});

app.get("/", (req, res) => res.send("Bot is Online 🚀"));

app.listen(3000, () => console.log("✅ السيرفر يعمل على منفذ 3000"));
