import express from "express";
import axios from "axios";
import fs from "fs";

const DATA_FILE = "./sessions_db.json";
let SESSIONS = {}; 

if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        if (rawData) SESSIONS = JSON.parse(rawData);
    } catch (e) { SESSIONS = {}; }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(SESSIONS, null, 2));
    } catch (e) { console.error("Save Error:", e.message); }
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

/* ================= 1. نظام البرومبت الموحد ================= */
const getSystemPrompt = () => {
    return `أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبلهجة أردنية.
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
⏰ الدوام: 2:00 ظهراً - 3:30 فجراً. لا يوجد صالة (استلام أو توصيل فقط).

🍔 **المنيو وعروض التوفير**:
- ساندويش ديناميت (45 سم): 1 د.أ | صاروخ شاورما (45 سم): 1.5 د.أ | خابور كباب: 2 د.أ.
- وجبات فردية (زنجر، سكالوب، برجر): 2 د.أ.
- وجبات عائلية: اقتصادية (7د)، عائلية (10د)، عملاقة (14د).
- شاورما: وجبة اقتصادية (6د)، وجبة أوفر (9د).
*(ملاحظة: لتحويل أي ساندويش لوجبة أضف 1 دينار)*.

🚚 **التوصيل**: (صويلح 1.5 | الجامعة، الجبيهة، الرشيد 2 | خلدا 2.5 | طبربور 3.5).

📅 **نظام الحجز وتجهيز الطلبات**:
- مسموح للزبون طلب تجهيز الطلب لموعد معين اليوم.
- المتطلبات: (الاسم، رقم الهاتف، الموعد، الطلب، المنطقة).
- عند اكتمال البيانات، أرسل [KITCHEN_GO] متبوعاً بالملخص.

⚠️ **قواعد صارمة**:
1. لا ترسل [KITCHEN_GO] إلا إذا كتب الزبون رقمه (07xxxxxxxx).
2. بمجرد توفر البيانات، اعرض الملخص متبوعاً بـ [KITCHEN_GO].
3. الصيغة للمطبخ بعد الكود:
🔔 طلب جديد مؤكد!
- النوع: [توصيل/استلام]
- الاسم: [الاسم]
- الرقم: [الرقم]
- العنوان: [المنطقة]
- الموعد: [الوقت]
- الطلب: [التفاصيل]
- المجموع: [الحساب + التوصيل] دينار`;
};

/* ================= 2. دوال الإرسال ================= */
async function sendMessage(platform, chatId, message) {
    try {
        if (platform === "wa") {
            await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
        } else {
            await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
                recipient: { id: chatId }, message: { text: message }
            });
        }
    } catch (err) { console.error("Send Error:", err.message); }
}

/* ================= 3. العقل المدبر ================= */
async function handleUserMessage(chatId, userMessage, platform = "wa", senderName = "يا غالي") {
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    // كشف التأكيد (تم)
    const isConfirmation = /^(تم|تمام|اوكي|ok|أكد|تاكيد|اعتمد)$/i.test(userMessage.trim());
    
    if (isConfirmation && session.lastKitchenMsg) {
        await sendMessage("wa", SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        const confirmMsg = `أبشر يا ${senderName}، طلبك اعتمدناه وصار بالمطبخ! نورت صابر جو 🙏`;
        await sendMessage(platform, chatId, confirmMsg);
        session.lastKitchenMsg = null; // مسح الطلب بعد الإرسال
        saveData();
        return;
    }

    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: getSystemPrompt() + `\n العميل: ${senderName}` },
                ...session.history.slice(-10),
                { role: "user", content: userMessage }
            ],
            temperature: 0.5
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim(); 
            const finalReply = parts[0].trim() + "\n\nاكتب 'تم' لتأكيد الطلب وإرساله للمطبخ ✅";
            await sendMessage(platform, chatId, finalReply);
        } else {
            // إذا غير الطلب وهو في مرحلة "قبل التأكيد" نحدث الذاكرة
            await sendMessage(platform, chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        if (session.history.length > 15) session.history = session.history.slice(-15);
        saveData();

    } catch (err) { console.error("AI Error:", err.message); }
}

/* ================= 4. Webhooks ================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200); // رد فوري
    const body = req.body;

    // واتساب (GreenAPI)
    if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const senderName = body.senderData?.senderName || "يا غالي";
        const messageData = body.messageData;
        
        let text = "";
        if (messageData?.typeMessage === "textMessage") text = messageData.textMessageData.textMessage;
        else if (messageData?.typeMessage === "quotedMessage") text = messageData.quotedMessageData.text;

        if (chatId && !chatId.endsWith("@g.us") && text) {
            handleUserMessage(chatId, text, "wa", senderName);
        }
    } 
    // فيسبوك ومسنجر
    else if (body.object === "page") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            handleUserMessage(messaging.sender.id, messaging.message.text, "facebook", "يا غالي");
        }
    }
});

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token === "SaberJo_Secret_2026") res.status(200).send(challenge);
    else res.sendStatus(403);
});

app.listen(3000, () => console.log("Saber Engine Running Securely!"));
