import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

// الإعدادات الأساسية
const CONFIG = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    ORDER_GROUP_ID: "120363407952234395@g.us",
    DELIVERY_SHEET_URL: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// المنيو (الأسماء والصور فقط، السعر يُدار برمجياً)
const MENU = {
    "خابور كباب": { p: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { p: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { p: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { p: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
};

let SESSIONS = {};
let DELIVERY_DATA = [];

/* =========================
   تحميل أسعار التوصيل من الشيت
   ========================= */
async function loadDelivery() {
    try {
        const res = await axios.get(CONFIG.DELIVERY_SHEET_URL);
        DELIVERY_DATA = await csv().fromString(res.data);
    } catch (e) { console.error("CSV Load Error"); }
}

/* =========================
   الذكاء الاصطناعي (المندوب الصارم)
   ========================= */
async function getAIResponse(userMsg, session) {
    const systemPrompt = `
    أنت مندوب مبيعات محترف. المنيو: ${Object.keys(MENU).join(", ")}.
    
    القواعد:
    1. لا تضف وجبة للسلة إلا بطلب صريح (أريد، سجل، أضف).
    2. عند الإضافة، أدرج الكود: [ADD:اسم_الوجبة:الكمية].
    3. إذا سأل عن التوصيل، اطلب منه اسم منطقته.
    4. إذا طلب "تصفير" أو "إلغاء"، أدرج الكود: [CLEAR].
    5. سلة العميل الحالية: ${JSON.stringify(session.items)}.
    6. رده باختصار شديد وذكاء لزيادة المبيعات.
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
            temperature: 0,
            max_tokens: 150
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return res.data.choices[0].message.content;
    } catch (e) { return "كيف يمكنني مساعدتك في طلبك اليوم؟"; }
}

/* =========================
   إرسال الرسائل والصور
   ========================= */
const send = (id, text) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message: text });
const sendImg = (id, url, cap) => axios.post(`${CONFIG.API_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, { chatId: id, urlFile: url, fileName: "food.jpg", caption: cap });

/* =========================
   المعالجة (Webhook)
   ========================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = req.body.senderData.chatId;
    const userMsg = (req.body.messageData?.textMessageData?.textMessage || "").trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], area: null, deliveryFee: 0 };
    const session = SESSIONS[chatId];

    await loadDelivery();

    // 1. فحص منطقة التوصيل من الشيت
    for (const zone of DELIVERY_DATA) {
        if (userMsg.includes(zone.area)) {
            session.area = zone.area;
            session.deliveryFee = parseFloat(zone.price);
            return send(chatId, `📍 تم تحديد منطقة التوصيل: ${zone.area}\nرسوم التوصيل هي: ${zone.price} دينار.`);
        }
    }

    // 2. معالجة التأكيد النهائي
    if (userMsg === "تأكيد" || userMsg === "تم") {
        const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);
        if (subTotal === 0) return send(chatId, "سلتك فارغة، ماذا تحب أن تطلب؟");
        
        const total = subTotal + session.deliveryFee;
        const orderDetails = session.items.map(i => `• ${i.name} (${i.q})`).join("\n");
        
        const groupMsg = `🔔 *طلب جديد مؤكد*\n👤 العميل: ${chatId}\n📍 المنطقة: ${session.area || "غير محدد"}\n🛒 الطلب:\n${orderDetails}\n💰 المجموع النهائي: ${total} دينار`;
        
        await send(CONFIG.ORDER_GROUP_ID, groupMsg);
        session.items = []; // تصفير السلة بعد النجاح
        return send(chatId, "✅ تم إرسال طلبك للمطعم بنجاح! شكراً لطلبك.");
    }

    // 3. استشارة الذكاء الاصطناعي
    const aiRes = await getAIResponse(userMsg, session);

    // معالجة الأكواد البرمجية داخل رد الـ AI
    if (aiRes.includes("[CLEAR]")) session.items = [];
    
    if (aiRes.includes("[ADD:")) {
        const match = aiRes.match(/\[ADD:(.*?):(\d+)\]/);
        if (match) {
            const name = match[1].trim();
            const qty = parseInt(match[2]);
            if (MENU[name]) {
                session.items.push({ name, p: MENU[name].p, q: qty });
                await sendImg(chatId, MENU[name].img, `تمت إضافة ${name} إلى سلتك! 😋`);
            }
        }
    }

    // تنظيف النص وحساب المجموع
    let cleanMsg = aiRes.replace(/\[ADD:.*?\]/g, "").replace("[CLEAR]", "").trim();
    const subTotal = session.items.reduce((s, i) => s + (i.p * i.q), 0);

    if (subTotal > 0) {
        cleanMsg += `\n\n🛒 سلتك: ${subTotal} د.أ\n🚚 التوصيل: ${session.deliveryFee} د.أ\n💰 المجموع: ${subTotal + session.deliveryFee} د.أ\n(أرسل "تأكيد" للطلب)`;
    }

    await send(chatId, cleanMsg);
});

app.listen(3000, () => console.log("Bot is Running..."));
