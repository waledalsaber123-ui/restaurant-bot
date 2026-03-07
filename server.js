import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (!["incomingMessageReceived", "incomingFileMessageReceived"].includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastOrder: null };
    const session = SESSIONS[chatId];

    let userMessage = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    let mediaUrl = body.messageData?.fileMessageData?.downloadUrl || null;

    // حل مشكلة الفويس (صورة 13)
    let promptContent = userMessage;
    if (mediaUrl) {
        promptContent += ` [نظام صابر: الزبون أرسل فويس أو صورة هنا: ${mediaUrl}. حللها ورد عليه بناءً على المنيو.]`;
    }

    try {
        // الرد السريع على الموقع (صورة 14) لتجنب التعليق
        if (userMessage.includes("الموقع") || userMessage.includes("لوكيشن") || userMessage.includes("وينكم")) {
            await sendWA(chatId, "موقعنا يا غالي: عمان - شارع الجامعة - طلوع هافانا 📍\nتفضل اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9");
            return;
        }

        // إرسال لـ Gemini
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] },
                    ...session.history,
                    { role: "user", parts: [{ text: promptContent }] }
                ]
            }, { timeout: 30000 }
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        // منطق المطبخ (صورة 3)
        if (reply.includes("[KITCHEN_GO]")) {
            session.lastOrder = reply.split("[KITCHEN_GO]")[1].trim();
            await sendWA(chatId, `${reply.split("[KITCHEN_GO]")[0].trim()}\n\nأكتب "تم" للتأكيد يا غالي ✅`);
        } else if (userMessage === "تم" && session.lastOrder) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastOrder);
            await sendWA(chatId, "أبشر، طلبك صار بالمطبخ! نورت صابر جو سناك 🙏");
            delete SESSIONS[chatId];
        } else {
            await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", parts: [{ text: promptContent }] });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 8) session.history.splice(0, 2);

    } catch (err) {
        console.error("Error:", err.message);
        // تجنب رسالة "السستم معلق" المتكررة
        if (!userMessage.includes("الموقع")) {
            await sendWA(chatId, "على راسي يا غالي، ارجع ابعث رسالتك كمان مرة صار عندي ضغط عالي 🙏");
        }
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000);
