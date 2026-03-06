import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

/* ========= الإعدادات (Environment Variables) ========= */
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    SHEET_URL: process.env.DELIVERY_SHEET_URL,
    GROUP_ID: "120363407952234395@g.us", // الجروب المطلوب
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// المنيو والأسعار الرسمية لضمان عدم الهلوسة
const MENU_PRICES = {
    "ديناميت": 1.0,
    "صاروخ الشاورما": 1.5,
    "قنبلة رمضان": 2.25,
    "خابور كباب": 2.0,
    "وجبة عائلية 4": 7.0,
    "وجبة عائلية 6": 10.0,
    "وجبة عائلية 9": 14.0,
    "وجبة شاورما عادي": 2.0,
    "ساندويش زنجر": 1.5,
    "وجبة زنجر": 2.0
};

const SESSIONS = {};
const LAST_MESSAGE = {};

/* ========= دالة حساب التوصيل من الشيت ========= */
async function getDeliveryPrice(areaText) {
    try {
        const res = await axios.get(SETTINGS.SHEET_URL);
        const data = await csv().fromString(res.data);
        const zone = data.find(d => areaText.includes(d.area.trim()));
        return zone ? parseFloat(zone.price) : 0;
    } catch (e) { return 0; }
}

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) { console.error("WA Send Error"); }
}

/* ========= المعالج الرئيسي (Webhook) ========= */
app.post("/webhook", async (req, res) => {
    // 1. حل مشكلة التكرار 100 مرة: الرد الفوري بـ 200
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم كافة أنواع الرسائل لحل مشكلة "في انتظار الرسالة"
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    // 2. منع الرد على الجروبات (فقط العملاء)
    if (!chatId || !text || chatId.includes("@g.us")) return;

    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: "", delivery: 0, total: 0 };
    const session = SESSIONS[chatId];

    // 3. البرومبت الصارم (System Prompt)
    const systemPrompt = `
    أنت كاشير مطعم "Saber Jo Snack". المنيو والأسعار: ${JSON.stringify(MENU_PRICES)}.
    لهجتك أردنية (يا غالي، أبشر، على راسي).
    مهمتك استخراج البيانات فقط بالأوامر التالية:
    - لطلب صنف: [ADD:اسم_الصنف:الكمية]
    - لتحديد منطقة: [AREA:اسم_المنطقة]
    - للتأكيد النهائي: [CONFIRM]
    لا تحسب المجموع بنفسك إطلاقاً، النظام سيقوم بذلك.
    `;

    try {
        const aiRes = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        const content = aiRes.data.choices[0].message.content;

        // 4. الحساب البرمجي الدقيق (Math Logic)
        if (content.includes("[ADD:")) {
            const matches = content.match(/\[ADD:(.*?):(\d+)\]/g);
            matches?.forEach(m => {
                const [_, name, qty] = m.match(/\[ADD:(.*?):(\d+)\]/);
                const price = MENU_PRICES[name] || 0;
                if (price > 0) session.items.push({ name, qty: parseInt(qty), p: price });
            });
        }

        if (content.includes("[AREA:")) {
            const areaName = content.match(/\[AREA:(.*?)\]/)[1];
            session.area = areaName;
            session.delivery = await getDeliveryPrice(areaName);
        }

        // حساب المجموع (سعر كل صنف × كميته) + التوصيل
        const subtotal = session.items.reduce((sum, i) => sum + (i.p * i.qty), 0);
        session.total = subtotal + session.delivery;

        // 5. التأكيد والإرسال للجروب
        if (content.includes("[CONFIRM]") && session.items.length > 0) {
            const groupMsg = `🚨 *طلب جديد مؤكد*\n\n📞 هاتف: ${chatId.split('@')[0]}\n📍 المنطقة: ${session.area}\n🍔 الطلبات:\n${session.items.map(i => `- ${i.name} (${i.qty})`).join('\n')}\n🚚 توصيل: ${session.delivery}د\n💰 الإجمالي: ${session.total} دينار`;
            
            await sendWA(SETTINGS.GROUP_ID, groupMsg);
            await sendWA(chatId, "أبشر يا غالي، تم تأكيد طلبك وإرساله للمطعم بنجاح! ✅");
            delete SESSIONS[chatId];
            return;
        }

        // الرد النصي النظيف للعميل مع السعر المحدث
        const cleanReply = content.replace(/\[.*?\]/g, "").trim();
        let finalReply = cleanReply || "على راسي يا غالي، شو بتحب تطلب؟";
        
        if (session.total > 0) {
            finalReply += `\n\n💰 *المجموع الحالي: ${session.total} دينار*`;
        }

        await sendWA(chatId, finalReply);

    } catch (e) { console.error("AI Error"); }
});

app.listen(3000, () => console.log("Saber Jo Bot is Live! 🚀"));
