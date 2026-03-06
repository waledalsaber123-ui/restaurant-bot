import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

/* ========= الإعدادات (ENV) ========= */
const { 
    OPENAI_KEY, 
    GREEN_TOKEN, 
    ID_INSTANCE, 
    DELIVERY_SHEET_URL, 
    SYSTEM_PROMPT 
} = process.env;

const GROUP_ID = "120363407952234395@g.us";
const API_URL = `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}`;

/* ========= الذاكرة المؤقتة ========= */
const SESSIONS = {};
const LAST_MESSAGE = {}; // لمنع تكرار معالجة نفس الرسالة
let DELIVERY = {};

// أسعار الوجبات (يمكنك نقلها للـ ENV أو ملف خارجي)
const PRICES = {
    "ديناميت": 2.5,
    "شاورما": 1.5,
    "زنجر": 2.0,
    "برجر": 3.0
};

/* ========= تحميل بيانات التوصيل ========= */
async function loadDelivery() {
    try {
        const res = await axios.get(DELIVERY_SHEET_URL);
        const rows = res.data.split("\n");
        rows.forEach(r => {
            const [area, price] = r.split(",");
            if (area) DELIVERY[area.trim()] = Number(price);
        });
        console.log("✅ تم تحميل مناطق التوصيل");
    } catch (e) {
        console.log("❌ فشل تحميل شيت التوصيل:", e.message);
    }
}
loadDelivery();

/* ========= وظائف الإرسال ========= */
async function sendMessage(chatId, text) {
    try {
        await axios.post(`${API_URL}/sendMessage/${GREEN_TOKEN}`, { chatId, message: text });
    } catch (e) { console.error("Send Error"); }
}

/* ========= محرك الذكاء الاصطناعي ========= */
async function runAI(message) {
    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            temperature: 0.2, // درجة حرارة منخفضة لضمان الدقة
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: message }
            ]
        }, {
            headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }
        });
        return res.data.choices[0].message.content;
    } catch (e) {
        return "أهلاً بك يا غالي 👋 كيف بقدر أساعدك اليوم؟";
    }
}

/* ========= بناء الرسائل ========= */
function buildSummary(order) {
    const itemsList = order.items.map(i => `• ${i.name} (السعر: ${i.p}د)`).join("\n");
    return `🧾 *ملخص الطلب*\n\n${itemsList}\n\n📍 *العنوان:* ${order.address}\n🚚 *أجور التوصيل:* ${order.delivery}د\n💰 *المجموع الكلي:* ${order.total}د\n\nاكتب *تأكيد* لتثبيت الطلب ✅`;
}

function buildGroupMessage(order) {
    const itemsList = order.items.map(i => `• ${i.name}`).join("\n");
    return `🚨 *طلب جديد*\n\n📞 *الهاتف:* ${order.phone}\n📍 *العنوان:* ${order.address}\n🍔 *الأصناف:*\n${itemsList}\n🚚 *التوصيل:* ${order.delivery}د\n💰 *الإجمالي:* ${order.total}د\n\n#${order.id}`;
}

/* ========= الويب هوك الرئيسي ========= */
app.post("/webhook", async (req, res) => {
    // 1. الحل الجذري للتكرار: الرد فوراً بـ 200
    res.sendStatus(200);

    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // دعم الرسائل النصية من الموبايل أو الويب (Linked Devices)
    const text = (body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "").trim();

    if (!chatId || !text || chatId.includes("@g.us")) return;

    // 2. منع معالجة نفس النص مرتين خلال ثوانٍ
    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    // 3. إدارة الجلسة
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { id: "ORD" + Date.now(), phone: chatId, items: [], address: "", delivery: 0, total: 0 };
    }
    const order = SESSIONS[chatId];

    // 4. منطق التأكيد
    if (text.includes("تأكيد")) {
        if (order.items.length === 0) return await sendMessage(chatId, "سلتك فارغة يا غالي، شو بتحب تطلب؟");
        await sendMessage(GROUP_ID, buildGroupMessage(order));
        await sendMessage(chatId, "تم تأكيد طلبك بنجاح ✅ وسيتم التواصل معك قريباً.");
        delete SESSIONS[chatId];
        return;
    }

    // 5. اكتشاف منطقة التوصيل وحساب المجموع
    const foundArea = Object.keys(DELIVERY).find(area => text.includes(area));
    if (foundArea) {
        order.address = text;
        order.delivery = DELIVERY[foundArea];
        const itemsTotal = order.items.reduce((sum, item) => sum + item.p, 0);
        order.total = itemsTotal + order.delivery;
        return await sendMessage(chatId, buildSummary(order));
    }

    // 6. التقاط الأصناف يدوياً (للسرعة) وحساب السعر
    let added = false;
    for (const [name, price] of Object.entries(PRICES)) {
        if (text.includes(name)) {
            order.items.push({ name: name, p: price });
            added = true;
        }
    }

    if (added) {
        const currentTotal = order.items.reduce((sum, item) => sum + item.p, 0);
        return await sendMessage(chatId, `تم إضافة الطلب 👍 المجموع الحالي للوجبات: ${currentTotal} دينار.\nوين التوصيل يا غالي؟`);
    }

    // 7. رد الذكاء الاصطناعي للدردشة العامة
    const aiReply = await runAI(text);
    await sendMessage(chatId, aiReply);
});

app.listen(3000, () => console.log("🚀 BOT IS RUNNING ON PORT 3000"));
