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
    DELIVERY_SHEET_URL: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// المنيو الأساسي
const MENU = {
    "خابور كباب": { p: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { p: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { p: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { p: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
};

let SESSIONS = {};
let DELIVERY_DATA = [];

async function loadDelivery() {
    try {
        const res = await axios.get(CONFIG.DELIVERY_SHEET_URL);
        DELIVERY_DATA = await csv().fromString(res.data);
    } catch (e) { console.error("CSV Load Error"); }
}

/* =========================================
   الذكاء الاصطناعي: محرك تحليل النوايا (Intent Engine)
   ========================================= */
async function processMessageAI(userMsg, session) {
    const systemPrompt = `
    أنت مندوب مبيعات ذكي جداً في مطعم. تفهم العامية والأخطاء الإملائية.
    المنيو: ${Object.keys(MENU).join(", ")}.
    
    مهمتك:
    1. إذا العميل يريد إضافة شيء (حتى لو أخطأ في الإملاء مثل "هات صاروخ")، استنتج الوجبة الصحيحة وأصدر الكود: [ADD:اسم_الوجبة:الكمية].
    2. إذا طلب التوصيل لمنطقة، قارنها ببيانات التوصيل: ${JSON.stringify(DELIVERY_DATA.map(d => d.area))}. إذا وجدتها، أصدر الكود: [ZONE:اسم_المنطقة].
    3. إذا أراد الحذف أو البدء من جديد، أصدر: [CLEAR].
    4. كن مرحاً وقصيراً في ردك النصي.
    5. سلة العميل الحالية: ${JSON.stringify(session.items)}.
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
            temperature: 0.3 // السماح بمرونة بسيطة لفهم الأخطاء الإملائية
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return res.data.choices[0].message.content;
    } catch (e) { return "أهلاً بك! كيف أقدر أخدمك اليوم؟"; }
}

const sendMsg = (id, message) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message });
const sendImg = (id, url, caption) => axios.post(`${CONFIG.API_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, { chatId: id, urlFile: url, fileName: "food.jpg", caption });

/* =========================================
   المعالجة الرئيسية
   ========================================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = req.body.senderData.chatId;
    const userMsg = (req.body.messageData?.textMessageData?.textMessage || "").trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: null, deliveryFee: 0 };
    const session = SESSIONS[chatId];

    await loadDelivery();

    // 1. معالجة التأكيد اليدوي
    if (userMsg.includes("تأكيد") || userMsg.includes("اكد")) {
        const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);
        if (subTotal === 0) return sendMsg(chatId, "سلتك فارغة يا غالي! شو حابب تاكل؟");
        
        const total = subTotal + session.deliveryFee;
        const summary = session.items.map(i => `• ${i.name} (${i.q})`).join("\n");
        const orderMsg = `🆕 *طلب جديد*\n👤 العميل: ${chatId}\n📍 المنطقة: ${session.area || "غير محدد"}\n🛒 الأصناف:\n${summary}\n💰 المجموع: ${total} دينار`;
        
        await sendMsg(CONFIG.ORDER_GROUP_ID, orderMsg);
        session.items = []; session.area = null;
        return sendMsg(chatId, "✅ أبشر، طلبك وصل للمطعم وهلا بنجهزه!");
    }

    // 2. معالجة الرسالة عبر الذكاء الاصطناعي
    const aiRes = await processMessageAI(userMsg, session);

    // فحص الأكواد المستخرجة
    if (aiRes.includes("[CLEAR]")) session.items = [];
    
    if (aiRes.includes("[ZONE:")) {
        const zoneName = aiRes.match(/\[ZONE:(.*?)\]/)[1];
        const zoneObj = DELIVERY_DATA.find(d => d.area === zoneName);
        if (zoneObj) {
            session.area = zoneName;
            session.deliveryFee = parseFloat(zoneObj.price);
        }
    }

    if (aiRes.includes("[ADD:")) {
        const match = aiRes.match(/\[ADD:(.*?):(\d+)\]/);
        if (match) {
            const name = match[1].trim();
            const qty = parseInt(match[2]);
            if (MENU[name]) {
                session.items.push({ name, p: MENU[name].p, q: qty });
                await sendImg(chatId, MENU[name].img, `تمت إضافة ${name} ✅`);
            }
        }
    }

    // تنظيف الرد النهائي
    let cleanText = aiRes.replace(/\[.*?\]/g, "").trim();
    const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);

    if (subTotal > 0) {
        cleanText += `\n\n🛒 سلتك: ${subTotal} د\n🚚 توصيل (${session.area || "حدد منطقتك"}): ${session.deliveryFee} د\n💰 المجموع: ${subTotal + session.deliveryFee} دينار\n(اكتب "تأكيد" لإتمام الطلب)`;
    }

    await sendMsg(chatId, cleanText);
});

app.listen(
