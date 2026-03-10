import express from "express";
import axios from "axios";
import fs from "fs";

const DATA_FILE = "./sessions_db.json";
let SESSIONS = {}; 

// تحميل الجلسات
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        if (rawData) SESSIONS = JSON.parse(rawData);
    } catch (e) { SESSIONS = {}; }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(SESSIONS, null, 2));
    } catch (e) { console.error("Error saving data:", e.message); }
}

const app = express();
app.use(express.json());

const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    PAGE_TOKEN: process.env.PAGE_TOKEN,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ================= 1. نظام البرومبت الموحد (صابر) ================= */
const getSystemPrompt = () => {
    return `أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبلهجة أردنية.
📍 **الموقع والدوام**: عمان - شارع الجامعة - طلوع هافانا. من 2:00 ظهراً وحتى 3:30 فجراً.

🍔 **المنيو الأساسي**:
- عروض الـ 45 سم (ديناميت 1د، صاروخ شاورما 1.5د، خابور كباب 2د).
- وجبات فردية 2د | وجبات عائلية (اقتصادية 7د، عائلية 10د، عملاقة 14د).
- شاورما عائلي: 6د و 9د.

⚠️ **قاعدة إرسال الطلب**:
بمجرد اكتمال: (الاسم، رقم الهاتف 07xxxxxxxx، العنوان، والطلب)، اعرض ملخص الطلب للزبون وأضف كود [KITCHEN_GO] متبوعاً بنسخة المطبخ.

الصيغة للمطبخ بعد [KITCHEN_GO]:
🔔 طلب جديد مؤكد!
- النوع: [توصيل/استلام]
- الاسم: [الاسم]
- الرقم: [الرقم]
- العنوان: [المنطقة]
- الطلب: [الأصناف]
- المجموع: [السعر النهائي] دينار`;
};

/* ================= 2. دوال الإرسال الموحدة ================= */
async function sendMessage(platform, chatId, message) {
    try {
        if (platform === "wa") {
            await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
        } else {
            await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
                recipient: { id: chatId }, message: { text: message }
            });
        }
    } catch (err) { console.error(`Send Error (${platform}):`, err.message); }
}

/* ================= 3. العقل المدبر (handleUserMessage) ================= */
async function handleUserMessage(chatId, userMessage, platform = "wa", senderName = "يا غالي") {
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];
    const msgClean = userMessage.trim().toLowerCase();

    // 1. فحص التأكيد (تم)
    const isConfirmation = /^(تم|تمام|اوكي|ok|أكد|تاكيد|اعتمد|وصل|حصل)$/i.test(msgClean);
    
    if (isConfirmation && session.lastKitchenMsg) {
        // إرسال الملخص المخزن مسبقاً للمطبخ
        await sendMessage("wa", SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        
        const confirmMsg = `أبشر يا ${senderName}، طلبك صار عند الشباب بالمطبخ وعالتحضير! نورت صابر جو 🙏`;
        await sendMessage(platform, chatId, confirmMsg);
        
        session.lastKitchenMsg = null; // تفريغ "الخزنة" بعد الإرسال
        session.history = []; // تصفير المحادثة لبداية جديدة
        saveData();
        return;
    }

    // 2. معالجة الـ AI
    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: getSystemPrompt() + `\n العميل: ${senderName}` },
                ...session.history.slice(-12),
                { role: "user", content: userMessage }
            ],
            temperature: 0.4
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            const clientReply = parts[0].trim();
            const kitchenContent = parts[1].trim();

            session.lastKitchenMsg = kitchenContent; // حفظ نسخة المطبخ هنا
            
            const finalReply = clientReply + "\n\nاكتب 'تم' لتأكيد الطلب وإرساله للمطبخ ✅";
            await sendMessage(platform, chatId, finalReply);
        } else {
            await sendMessage(platform, chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        if (session.history.length > 15) session.history = session.history.slice(-15);
        saveData();

    } catch (err) { console.error("AI Error:", err.message); }
}

/* ================= 4. الويب هوك (Webhooks) ================= */
app.post("/webhook", async (req, res) => {
