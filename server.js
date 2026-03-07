import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: "120363407952234395@g.us", 
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= نظام البرومبت الموحد والشامل ================= */
const getSystemPrompt = () => {
    return `
أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية.

📍 **الموقع والدوام**:
- الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا. اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9.
- الدوام: يومياً من 2:00 ظهراً وحتى 3:30 فجراً.

📅 **نظام الحجوزات والمواعيد**:
- وافق على أي طلب "حجز" لموعد محدد اليوم.
- إذا طلب الزبون الطلب لوقت لاحق (مثلاً الساعة 6)، اسأله عن "موعد الاستلام" بوضوح.
- الحجز يعني تجهيز الطلب في وقت معين، وليس حجز طاولة (المطعم سناك وتوصيل فقط).

🍔 **المنيو الرسمي (الأسعار ثابتة)**:
- وجبات عائلية: اقتصادية (7 دنانير)، عائلية (10 دنانير)، العملاقة (14 دينار).
- شاورما صدر: اقتصادية (6 دنانير)، عائلية (9 دنانير).
- وجبات فردية (مع بطاطا): سكالوب/زنجر/برجر 150غم (2 دينار).
- شاورما فردي: عادي (2 د.أ)، سوبر (2.75 د.أ)، دبل (3.25 د.أ)، تربل (4 د.أ).
- ساندويشات فرط: سكالوب/زنجر/برجر (1.5 د.أ)، شاورما عادي (1 د.أ)، سوبر (1.5 د.أ).
- **عروض خاصة**: ديناميت (45 سم) بـ 1 دينار، صاروخ شاورما بـ 1.5 دينار، قنبلة رمضان (برجر 250 غم) بـ 2.25 دينار، خابور كباب بـ 2 دينار.
⚠️ **ملاحظة**: لتحويل أي ساندويش أو عرض إلى وجبة، أضف 1 دينار.

🚚 **أسعار مناطق التوصيل (ممنوع تغييرها)**:
صويلح، إشارة الدوريات، مجدي مول (1.5 د.أ).
الجامعة الأردنية، ضاحية الرشيد، الجبيهة، تلاع العلي، حي الجامعة، الكمالية، خلدا، أم السماق، المدينة الطبية (2.0 د.أ).
شارع مكة، شارع عبدالله غوشة، الرابية، الجاردنز، أم أذينة، الصويفية، الشميساني، عبدلي، جبل الحسين (2.5 - 2.75 د.أ).
جبل عمان، الدوار 1-8، عبدون، طبربور، وسط البلد، ماركا، المقابلين، مرج الحمام (3.0 - 4.0 د.أ).

⚠️ **قواعد الإرسال للمطبخ (صارمة)**:
لا ترسل الكود إلا بعد توفر (الاسم، رقم التلفون، المنطقة، الموعد).
[KITCHEN_GO]
🔔 طلب جديد مؤكد!
الاسم: [الاسم]
الرقم: [الرقم]
العنوان: [المنطقة أو استلام]
الموعد المطلوب: [الآن أو الساعة المحددة]
الطلب: [الأصناف + السعر + التوصيل = المجموع]
`;
};

/* ================= المحرك الرئيسي المصلح ================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userMessage = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
    if (!userMessage) return;

    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o", 
            messages: [
                { role: "system", content: getSystemPrompt() },
                ...session.history.slice(-40), // 🚨 ذاكرة 40 رسالة كما طلبت
                { role: "user", content: userMessage }
            ],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 30000 });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, parts[0].trim() + "\n\nأكتب 'تم' للتأكيد ✅");
        } else {
            await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        if (session.history.length > 50) session.history.splice(0, 2);

    } catch (err) {
        console.error("Error:", err.message);
        await sendWA(chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (err) {}
}

app.listen(3000, () => console.log("Saber Smart Engine is Live & Stable!"));
