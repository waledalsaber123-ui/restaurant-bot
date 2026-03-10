import express from "express";
import axios from "axios";

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

const SESSIONS = {};

// دالة جلب البرومبت
const getSystemPrompt = () => {
    return `أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية... (بقية البرومبت الخاص بك)`;
};

// دالة إرسال واتساب
async function sendWA(chatId, text) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message: text });
    } catch (e) { console.error("WA Error:", e.message); }
}

// دالة إرسال فيسبوك
async function sendFB(psid, message) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
            recipient: { id: psid },
            message: { text: message }
        });
    } catch (err) { console.error("FB Error:", err.response?.data || err.message); }
}

// المعالج الرئيسي للرسائل
async function handleUserMessage(chatId, userMessage, platform = "wa") {
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    // منطق التأكيد
    if (/^(تم|تمام|ايوا|ok|أكد|تاكيد)$/i.test(userMessage.trim()) && session.lastKitchenMsg) {
        await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        const successMsg = "أبشر يا غالي، طلبك وصل للمطبخ 🙏";
        platform === "facebook" ? await sendFB(chatId, successMsg) : await sendWA(chatId, successMsg);
        session.lastKitchenMsg = null;
        return;
    }

    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [
                { role: "system", content: getSystemPrompt() },
                ...session.history.slice(-18),
                { role: "user", content: userMessage }
            ],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 25000 });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            const finalReply = parts[0].trim() + "\n\nاكتب 'تم' للتأكيد ✅";
            platform === "facebook" ? await sendFB(chatId, finalReply) : await sendWA(chatId, finalReply);
        } else {
            platform === "facebook" ? await sendFB(chatId, reply) : await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

    } catch (err) {
        console.error("AI Error:", err.message);
        const errMsg = "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏";
        platform === "facebook" ? await sendFB(chatId, errMsg) : await sendWA(chatId, errMsg);
    }
}

// Webhook Verification
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "SaberJo_Secret_2026";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

// استقبال الرسائل
app.post("/webhook", async (req, res) => {
    // إرسال رد فوراً لمنع التكرار (مهم جداً!)
    res.sendStatus(200); 

    const body = req.body;

    // فيسبوك وانستجرام
    if (body.object === "page" || body.object === "instagram") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            handleUserMessage(messaging.sender.id, messaging.message.text, "facebook");
        }
    } 
    // واتساب (GreenAPI)
    else if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
        if (chatId && !chatId.endsWith("@g.us") && text) {
            handleUserMessage(chatId, text, "wa");
        }
    }
});

app.listen(3000, () => console.log("Saber Smart Engine is Live & Stable!"));
