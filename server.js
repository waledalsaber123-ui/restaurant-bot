import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

/* ========= الإعدادات (ENV) ========= */
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    SHEET_URL: process.env.DELIVERY_SHEET_URL,
    GROUP_ID: "120363407952234395@g.us", // معرف الجروب الخاص بك
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// أسعار الوجبات ثابتة هنا لضمان دقة الحساب وعدم الهلوسة
const MENU_PRICES = {
    "كباب": 5.0,
    "شاورما": 3.0,
    "زنجر": 4.0,
    "ديناميت زنجر": 2.5
};

const SESSIONS = {};
const LAST_MESSAGE = {}; 

/* ========= وظيفة جلب سعر التوصيل من الرابط ========= */
async function getDeliveryPrice(areaText) {
    try {
        const res = await axios.get(SETTINGS.SHEET_URL);
        const data = await csv().fromString(res.data);
        // البحث عن تطابق اسم المنطقة في النص
        const zone = data.find(d => areaText.includes(d.area.trim()));
        return zone ? parseFloat(zone.price) : 0;
    } catch (e) { return 0; }
}

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) { console.error("Error sending WA"); }
}

/* ========= المعالج الرئيسي (Webhook) ========= */
app.post("/webhook", async (req, res) => {
    // 1. الحل الجذري للتكرار: الرد فوراً بـ 200 لمنع إعادة الإرسال من السيرفر
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم كافة أنواع الرسائل لحل مشكلة "في انتظار الرسالة"
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    // تجاهل الجروبات والرسائل الفارغة
    if (!chatId || !text || chatId.includes("@g.us")) return;

    // منع معالجة نفس الرسالة مرتين
    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { items: [], area: "", delivery: 0, total: 0, confirmed: false };
    }
    const session = SESSIONS[chatId];

    // 2. برومبت النظام الصارم لمنع الهلوسة
    const systemPrompt = `
    أنت بوت مطعم. قائمة الأسعار الرسمية: ${JSON.stringify(MENU_PRICES)}.
    استخرج الطلبات فقط بصيغة: [ADD:اسم_الصنف:الكمية].
    استخرج المنطقة بصيغة: [AREA:اسم_المنطقة].
    إذا أكد العميل الطلب (مثلاً قال "أكد" أو "نعم ثبت")، أجب بكلمة واحدة: [CONFIRM].
    لا تحسب المجموع بنفسك، النظام سيقوم بذلك.
    `;

    try {
        const aiRes = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0 // صفر لمنع الهلوسة والالتزام بالحقائق
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        const content = aiRes.data.choices[0].message.content;

        // 3. معالجة العمليات الحسابية برمجياً (Math Logic)
        if (content.includes("[ADD:")) {
            const matches = content.match(/\[ADD:(.*?):(\d+)\]/g);
            matches?.forEach(m => {
                const [_, name, qty] = m.match(/\[ADD:(.*?):(\d+)\]/);
                if (MENU_PRICES[name]) {
                    session.items.push({ name, qty: parseInt(qty), price: MENU_PRICES[name] });
                }
            });
        }

        if (content.includes("[AREA:")) {
            const area = content.match(/\[AREA:(.*?)\]/)[1];
            session.area = area;
            session.delivery = await getDeliveryPrice(area);
        }

        // حساب المجموع الكلي بدقة
        const subtotal = session.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        session.total = subtotal + session.delivery;

        // 4. منطق التأكيد والإرسال للجروب
        if (content.includes("[CONFIRM]") && session.items.length > 0) {
            const orderSummary = `🚨 *طلب جديد مؤكد*:\n\n` +
                `📱 العميل: ${chatId.split('@')[0]}\n` +
                `📍 المنطقة: ${session.area}\n` +
                `🍔 الأصناف:\n${session.items.map(i => `- ${i.name} (${i.qty})`).join('\n')}\n` +
                `🚚 التوصيل: ${session.delivery}د\n` +
                `💰 الإجمالي: ${session.total} دينار`;
            
            await sendWA(SETTINGS.GROUP_ID, orderSummary);
            await sendWA(chatId, "تم تأكيد طلبك وإرساله للمطعم بنجاح! ✅");
            delete SESSIONS[chatId];
            return;
        }

        // بناء الرد النصي للعميل مع المجموع المحدث
        const cleanReply = content.replace(/\[.*?\]/g, "").trim();
        let finalMessage = cleanReply || "أهلاً بك، كيف يمكنني مساعدتك؟";
        
        if (session.items.length > 0) {
            finalMessage += `\n\n*سلتك الحالية*:\n` + 
                session.items.map(i => `- ${i.name} (${i.qty})`).join('\n') +
                `\n💰 المجموع الحالي: ${session.total} دينار.\n(أرسل "تأكيد" للطلب)`;
        }

        await sendWA(chatId, finalMessage);

    } catch (e) { console.error("AI Error"); }
});

app.listen(3000, () => console.log("🚀 Server Running on Port 3000"));
