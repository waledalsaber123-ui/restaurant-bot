import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const CONFIG = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    ORDER_GROUP_ID: "120363407952234395@g.us",
    DELIVERY_SHEET: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// بيانات المنيو والصور
const MENU_DATA = {
    "خابور كباب": { p: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { p: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { p: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { p: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
    // أضف البقية هنا بنفس النسق القصير p للسعر و img للصورة
};

let SESSIONS = {}; 

/* =========================================
   محرّك الذكاء الاصطناعي (المندوب المقتصد)
   ========================================= */
async function callAI(userMsg, session) {
    const systemPrompt = `
    أنت مندوب مبيعات مختصر جداً. المنيو: ${JSON.stringify(Object.keys(MENU_DATA))}.
    القواعد:
    1. ردك لا يتجاوز 15 كلمة.
    2. إذا سأل عن الأصناف، اذكر 3 فقط واقترح تجربة واحد.
    3. إذا طلب فعلياً، أضف السطر: [JSON:{"items":[{"n":"اسم الوجبة","q":1}]}]
    4. لا تستخرج JSON إذا كان المستخدم يستفسر فقط.
    5. رصيد محفظته الحالي: ${session.wallet} دينار.
    `;

    try {
        const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini", // الأرخص والأسرع
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
            max_tokens: 100 // لتقليل التكلفة
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return ai.data.choices[0].message.content;
    } catch (e) { return "تفضل، كيف أخدمك؟"; }
}

/* =========================================
   الدوال الأساسية
   ========================================= */
const send = (id, text) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message: text });
const sendImg = (id, url, cap) => axios.post(`${CONFIG.API_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, { chatId: id, urlFile: url, fileName: "a.jpg", caption: cap });

/* =========================================
   المعالجة الرئيسية (Webhook)
   ========================================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData.chatId;
    const userMsg = body.messageData?.textMessageData?.textMessage || "";

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], wallet: 0, area: null };
    const session = SESSIONS[chatId];

    // 1. منطق التأكيد (بدون ذكاء اصطناعي لتوفير التكلفة)
    if (userMsg.includes("تأكيد")) {
        if (session.items.length === 0) return send(chatId, "سلتك فارغة!");
        const total = session.items.reduce((s, i) => s + (i.p * i.q), 0);
        await send(CONFIG.ORDER_GROUP_ID, `🔔 طلب جديد من ${chatId}\nالمجموع: ${total}د\nسحب الطلب: #سحب_${Math.floor(Math.random()*900)}`);
        session.items = [];
        return send(chatId, "تم التأكيد! سيصلك الطلب قريباً.");
    }

    // 2. معالجة المحفظة
    if (userMsg.includes("محفظة") || userMsg.includes("رصيدي")) {
        return send(chatId, `💰 رصيدك الحالي: ${session.wallet} دينار.\nيمكنك شحنها عند الاستلام.`);
    }

    // 3. ذكاء المندوب
    const aiRes = await callAI(userMsg, session);

    // معالجة إضافة الطلب والصور
    if (aiRes.includes("[JSON:")) {
        const jsonStr = aiRes.split("[JSON:")[1].split("]")[0];
        const data = JSON.parse(jsonStr);
        for (const item of data.items) {
            const product = MENU_DATA[item.n];
            if (product) {
                session.items.push({ name: item.n, p: product.p, q: item.q });
                await sendImg(chatId, product.img, `تم إضافة ${item.n} ✅`);
            }
        }
    }

    await send(chatId, aiRes.split("[JSON:")[0].trim());
});

app.listen(3000);
