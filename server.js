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
    SHEET_URL: process.env.DELIVERY_SHEET_URL,
    GROUP_ID: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// أسعار المنيو حسب البرومبت (للحساب البرمجي الدقيق)
const PRICES = {
    "ديناميت": 1.0,
    "صاروخ الشاورما": 1.5,
    "قنبلة رمضان": 2.25,
    "خابور كباب": 2.0,
    "زنجر": 1.5,
    "برجر": 1.5,
    "شاورما عادي": 1.0
};

const SESSIONS = {};
const LAST_MESSAGE = {};

/* ========= دالة الحساب والتوصيل ========= */
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
    } catch (e) { console.error("Send Error"); }
}

/* ========= الويب هوك (حل التكرار والهلوسة) ========= */
app.post("/webhook", async (req, res) => {
    // 1. حل التكرار: رد فوري بـ 200
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم فك التشفير للرسائل المعلقة (image_9820a9.jpg)
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    if (!chatId || !text || chatId.includes("@g.us")) return;
    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: "", delivery: 0, total: 0 };
    const session = SESSIONS[chatId];

    // 2. برومبت النظام (ياخذ الأسعار من هنا)
    const systemPrompt = `
    أنت كاشير مطعم "Saber Jo Snack". 
    المنيو: ${JSON.stringify(PRICES)}.
    استخرج الأوامر فقط: [ADD:اسم_الصنف:الكمية] أو [AREA:المنطقة] أو [CONFIRM].
    لهجتك أردنية (يا غالي، أبشر).
    `;

    try {
        const aiRes = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        const content = aiRes.data.choices[0].message.content;

        // 3. معالجة الحساب (الكمية × السعر) - حل مشكلة الـ 7 دنانير
        if (content.includes("[ADD:")) {
            const matches = content.match(/\[ADD:(.*?):(\d+)\]/g);
            matches?.forEach(m => {
                const [_, name, qty] = m.match(/\[ADD:(.*?):(\d+)\]/);
                const p = PRICES[name] || 0;
                if (p > 0) session.items.push({ name, qty: parseInt(qty), p });
            });
        }

        if (content.includes("[AREA:")) {
            const area = content.match(/\[AREA:(.*?)\]/)[1];
            session.area = area;
            session.delivery = await getDeliveryPrice(area);
        }

        // الحساب النهائي
        const itemsTotal = session.items.reduce((sum, i) => sum + (i.p * i.qty), 0);
        session.total = itemsTotal + session.delivery;

        if (content.includes("[CONFIRM]") && session.items.length > 0) {
            const summary = `🚨 طلب مؤكد:\nالعميل: ${chatId}\nالطلب: ${JSON.stringify(session.items)}\nالإجمالي: ${session.total}د`;
            await sendWA(SETTINGS.GROUP_ID, summary);
            await sendWA(chatId, "تم التأكيد يا غالي! ✅");
            delete SESSIONS[chatId];
            return;
        }

        const reply = content.replace(/\[.*?\]/g, "").trim() + (session.total > 0 ? `\n\nالمجموع: ${session.total}د` : "");
        await sendWA(chatId, reply);

    } catch (e) { console.error("AI Error"); }
});

app.listen(3000, () => console.log("🚀 BOT RUNNING"));
