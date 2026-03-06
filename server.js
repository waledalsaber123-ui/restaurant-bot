import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

/* ========= الإعدادات المباشرة ========= */
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    GROUP_ID: "120363407952234395@g.us",
    SHEET_URL: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// قائمة الأسعار الحقيقية (لضمان دقة الحساب)
const MENU_PRICES = {
    "كباب": 5.0,
    "ديناميت زنجر": 2.5,
    "شاورما": 3.0,
    "زنجر": 4.0
};

const SESSIONS = {};
const LAST_MESSAGE = {}; 

/* ========= وظيفة جلب سعر التوصيل ========= */
async function getDeliveryPrice(areaName) {
    try {
        const res = await axios.get(SETTINGS.SHEET_URL);
        const data = await csv().fromString(res.data);
        const zone = data.find(d => areaName.includes(d.area.trim()));
        return zone ? parseFloat(zone.price) : 0;
    } catch (e) { return 0; }
}

/* ========= وظيفة إرسال الرسائل ========= */
async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) { console.error("Error sending WA"); }
}

/* ========= المعالج الرئيسي (Webhook) ========= */
app.post("/webhook", async (req, res) => {
    // 1. رد فوري لمنع التكرار (Spam Protection)
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم كافة أنواع الرسائل لحل مشكلة التشفير المعلق
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    if (!chatId || !text || chatId.includes("@g.us")) return;

    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { items: [], area: "", delivery: 0, total: 0 };
    }
    const session = SESSIONS[chatId];

    // 2. برومبت النظام مع قائمة الأسعار الصارمة
    const systemPrompt = `
    أنت بوت مطعم. قائمة الأسعار: ${JSON.stringify(MENU_PRICES)}.
    مهمتك استخراج الأصناف والكميات بدقة.
    - إذا طلب العميل، رد بـ: [ADD:اسم_الصنف:الكمية].
    - إذا ذكر منطقة، رد بـ: [AREA:اسم_المنطقة].
    - إذا أكد الطلب، رد بـ: [CONFIRM].
    السلة الحالية: ${JSON.stringify(session.items)}.
    `;

    try {
        const aiRes = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        const content = aiRes.data.choices[0].message.content;

        // 3. تصحيح منطق الحساب (الكمية × السعر)
        if (content.includes("[ADD:")) {
            const matches = content.match(/\[ADD:(.*?):(\d+)\]/g);
            matches.forEach(match => {
                const [_, name, qty] = match.match(/\[ADD:(.*?):(\d+)\]/);
                const price = MENU_PRICES[name] || 0;
                session.items.push({ name, qty: parseInt(qty), price: price });
            });

            // حساب المجموع الفرعي للوجبات
            session.total = session.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        }

        if (content.includes("[AREA:")) {
            const area = content.match(/\[AREA:(.*?)\]/)[1];
            session.area = area;
            session.delivery = await getDeliveryPrice(area);
            session.total += session.delivery;
        }

        if (content.includes("[CONFIRM]")) {
            const summary = `🚨 طلب مؤكد:\nالطلب: ${session.items.map(i => `${i.name} (${i.qty})`).join(", ")}\nالإجمالي: ${session.total}د`;
            await sendWA(SETTINGS.GROUP_ID, summary);
            await sendWA(chatId, "تم التأكيد ✅");
            delete SESSIONS[chatId];
            return;
        }

        const cleanReply = content.replace(/\[.*?\]/g, "").trim();
        const finalMessage = cleanReply + (session.total > 0 ? `\n\nالمجموع الحالي: ${session.total} دينار.` : "");
        await sendWA(chatId, finalMessage);

    } catch (e) { console.error("AI Error"); }
});

app.listen(3000, () => console.log("Bot Ready 🚀"));
