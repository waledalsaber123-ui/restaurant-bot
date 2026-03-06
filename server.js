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

// ذاكرة مؤقتة للجلسات
let SESSIONS = {};

/* =========================================
   وظيفة سحب أسعار التوصيل من الشيت
   ========================================= */
async function getDeliveryPrice(userArea) {
    try {
        const res = await axios.get(CONFIG.DELIVERY_SHEET_URL);
        const data = await csv().fromString(res.data);
        // البحث عن المنطقة (تجاهل المسافات وحالة الأحرف)
        const zone = data.find(d => userArea.includes(d.area.trim()));
        return zone ? parseFloat(zone.price) : null;
    } catch (e) { return null; }
}

/* =========================================
   محرك الذكاء الاصطناعي (كل التعليمات هنا)
   ========================================= */
async function getAIResponse(userMsg, session) {
    const prompt = `
    أنت مندوب مبيعات ذكي لمطعم.
    المنيو: (خابور كباب: 2د، الوجبة العملاقة: 3د، صاروخ شاورما: 1.5د، زنجر ديناميت: 2د).
    
    تعليماتك:
    1. اطلب منطقة العميل لحساب التوصيل.
    2. إذا طلب وجبة (حتى بلهجة عامية أو خطأ إملائي)، استنتج الاسم الصحيح وأضفه للسلة.
    3. لا تكرر إضافة الوجبة إلا إذا طلب العميل زيادة الكمية.
    4. إذا قررت إضافة وجبة، ابدأ ردك بـ [ADD:اسم_الوجبة:الكمية].
    5. إذا قررت تحديد منطقة التوصيل، ابدأ ردك بـ [SET_AREA:اسم_المنطقة].
    6. إذا طلب العميل البدء من جديد، ابدأ بـ [CLEAR].
    7. سلة العميل: ${JSON.stringify(session.items)}. المنطقة: ${session.area || "غير محددة"}.
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: prompt }, { role: "user", content: userMsg }],
            temperature: 0 // لضمان الدقة وعدم الهلوسة
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });
        return res.data.choices[0].message.content;
    } catch (e) { return "أهلاً بك، كيف يمكنني مساعدتك؟"; }
}

/* =========================================
   المعالج الرئيسي (Webhook)
   ========================================= */
app.post("/webhook", async (req, res) => {
    // 1. رد فوراً على GreenAPI لمنع تعليق الرد (مهم جداً!)
    res.sendStatus(200); 

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData.chatId;
    const userMsg = (body.messageData?.textMessageData?.textMessage || "").trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: null, deliveryFee: 0 };
    const session = SESSIONS[chatId];

    // 2. منطق التأكيد والترحيل للجروب
    if (userMsg.includes("تأكيد") || userMsg.includes("اكد")) {
        const total = session.items.reduce((s, i) => s + (i.p * i.q), 0) + session.deliveryFee;
        if (total === 0) return; 

        const summary = session.items.map(i => `${i.n} (${i.q})`).join(", ");
        await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, {
            chatId: CONFIG.ORDER_GROUP_ID,
            message: `🔔 طلب جديد:\nالعميل: ${chatId}\nالمنطقة: ${session.area}\nالطلب: ${summary}\nالمجموع: ${total}د`
        });
        session.items = []; session.area = null;
        return axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId, message: "✅ تم تأكيد طلبك!" });
    }

    // 3. الحصول على رد الذكاء الاصطناعي ومعالجة الأوامر
    const aiRes = await getAIResponse(userMsg, session);

    if (aiRes.includes("[CLEAR]")) { session.items = []; session.area = null; session.deliveryFee = 0; }
    
    if (aiRes.includes("[SET_AREA:")) {
        const areaName = aiRes.match(/\[SET_AREA:(.*?)\]/)[1];
        const price = await getDeliveryPrice(areaName);
        if (price !== null) { session.area = areaName; session.deliveryFee = price; }
    }

    if (aiRes.includes("[ADD:")) {
        const match = aiRes.match(/\[ADD:(.*?):(\d+)\]/);
        const meal = match[1]; const qty = parseInt(match[2]);
        const prices = { "خابور كباب": 2, "الوجبة العملاقة": 3, "صاروخ شاورما": 1.5, "زنجر ديناميت": 2 };
        if (prices[meal]) session.items.push({ n: meal, p: prices[meal], q: qty });
    }

    // 4. تنظيف النص وحساب الحساب الحالي
    let finalMsg = aiRes.replace(/\[.*?\]/g, "").trim();
    const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);
    
    if (subTotal > 0) {
        finalMsg += `\n\n🛒 سلتك: ${subTotal}د\n🚚 توصيل: ${session.deliveryFee}د\n💰 المجموع: ${subTotal + session.deliveryFee}د\n(اكتب "تأكيد" لإتمام الطلب)`;
    }

    // إرسال الرد النهائي للعميل
    await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId, message: finalMsg });
});

app.listen(3000);
