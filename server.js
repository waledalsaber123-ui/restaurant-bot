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

// المنيو المعتمد
const MENU = {
    "خابور كباب": { p: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { p: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { p: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { p: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
};

let SESSIONS = {};
let DELIVERY_DATA = [];

// تحميل أسعار التوصيل من الإكسل
async function loadDelivery() {
    try {
        const res = await axios.get(CONFIG.DELIVERY_SHEET_URL);
        DELIVERY_DATA = await csv().fromString(res.data);
    } catch (e) { console.error("خطأ في تحميل شيت التوصيل"); }
}

/* =========================================
   محرك تحليل اللهجة والأخطاء الإملائية
   ========================================= */
async function analyzeIntentAI(userMsg, session) {
    const prompt = `
    أنت مندوب مبيعات شاطر. المنيو: ${Object.keys(MENU).join(", ")}.
    حلل رسالة العميل:
    1. إذا طلب وجبة (حتى بلهجة عامية أو خطأ إملائي)، أضف: [ADD:اسم_الوجبة_الرسمي:الكمية].
    2. إذا ذكر منطقة، قارنها بـ: ${JSON.stringify(DELIVERY_DATA.map(d => d.area))}. إذا طابقت، أضف: [ZONE:اسم_المنطقة].
    3. إذا أراد البدء من جديد، أضف: [CLEAR].
    4. رد عليه بكلمات قليلة جداً ومرحة.
    5. سلة العميل حالياً: ${JSON.stringify(session.items)}.
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: prompt }, { role: "user", content: userMsg }],
            temperature: 0.1 // دقة عالية جداً لمنع الهلوسة
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });
        return res.data.choices[0].message.content;
    } catch (e) { return "أهلاً بك! كيف أقدر أساعدك؟"; }
}

const sendMsg = (id, message) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message });
const sendImg = (id, url, caption) => axios.post(`${CONFIG.API_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, { chatId: id, urlFile: url, fileName: "meal.jpg", caption });

/* =========================================
   المعالج الرئيسي (Webhook)
   ========================================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = req.body.senderData.chatId;
    const userMsg = (req.body.messageData?.textMessageData?.textMessage || "").trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: null, deliveryFee: 0 };
    const session = SESSIONS[chatId];

    await loadDelivery();

    // 1. ترحيل الطلب للجروب عند التأكيد
    if (userMsg.includes("تأكيد") || userMsg.includes("اكد")) {
        const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);
        if (subTotal === 0) return sendMsg(chatId, "سلتك فاضية يا غالي!");
        
        const total = subTotal + session.deliveryFee;
        const summary = session.items.map(i => `• ${i.name} (${i.q})`).join("\n");
        const finalOrder = `📦 *طلب جديد مؤكد*\n👤 العميل: ${chatId}\n📍 المنطقة: ${session.area || "لم تحدد"}\n🛒 الطلب:\n${summary}\n💰 المجموع: ${total} دينار`;
        
        await sendMsg(CONFIG.ORDER_GROUP_ID, finalOrder);
        session.items = []; session.area = null;
        return sendMsg(chatId, "✅ أبشر! طلبك صار عند المطعم.");
    }

    // 2. تحليل الرسالة بالذكاء الاصطناعي
    const aiResponse = await analyzeIntentAI(userMsg, session);

    // تنفيذ الأوامر المستخرجة
    if (aiResponse.includes("[CLEAR]")) session.items = [];
    
    if (aiResponse.includes("[ZONE:")) {
        const zone = aiResponse.match(/\[ZONE:(.*?)\]/)[1];
        const found = DELIVERY_DATA.find(d => d.area === zone);
        if (found) { session.area = zone; session.deliveryFee = parseFloat(found.price); }
    }

    if (aiResponse.includes("[ADD:")) {
        const match = aiResponse.match(/\[ADD:(.*?):(\d+)\]/);
        if (match) {
            const name = match[1]; const qty = parseInt(match[2]);
            if (MENU[name]) {
                session.items.push({ name, p: MENU[name].p, q: qty });
                await sendImg(chatId, MENU[name].img, `تم إضافة ${name} لسلتك 😋`);
            }
        }
    }

    // بناء الرد النهائي
    let reply = aiResponse.replace(/\[.*?\]/g, "").trim();
    const currentSubtotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);

    if (currentSubtotal > 0) {
        reply += `\n\n🛒 حسابك: ${currentSubtotal}د\n🚚 توصيل: ${session.deliveryFee}د\n💰 المجموع: ${currentSubtotal + session.deliveryFee} دينار\n(اكتب "تأكيد" للطلب)`;
    }

    await sendMsg(chatId, reply);
});

app.listen(3000);
