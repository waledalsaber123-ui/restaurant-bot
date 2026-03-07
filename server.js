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
    
    // فلترة الرسائل الداخلة
    if (!["incomingMessageReceived", "incomingFileMessageReceived"].includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    let mediaUrl = body.messageData?.fileMessageData?.downloadUrl || null;

    // 1. حل مشكلة الموقع (صورة 14) - رد مباشر بدون AI لتجنب التعليق
    const locationKeywords = ["الموقع", "لوكيشن", "وينكم", "وين المحل", "وين موقعكم"];
    if (locationKeywords.some(key => userText.includes(key))) {
        await sendWA(chatId, "أبشر يا غالي، محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. \nوهذا اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
        return; 
    }

    try {
        // 2. معالجة الرسالة للـ AI
        let promptContent = userText;
        if (mediaUrl) {
            promptContent += `\n[ملاحظة: الزبون أرسل ملف (فويس أو صورة) هنا: ${mediaUrl}. حلله ورد عليه.]`;
        }

        // إرسال لـ Gemini مع وقت انتظار أطول للفويسات
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] },
                    ...session.history,
                    { role: "user", parts: [{ text: promptContent }] }
                ]
            }, { timeout: 45000 } 
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        // 3. منطق التأكيد والمطبخ (صورة 13)
        if (reply.includes("[KITCHEN_GO]")) {
            session.lastKitchenMsg = reply.split("[KITCHEN_GO]")[1].trim();
            await sendWA(chatId, `${reply.split("[KITCHEN_GO]")[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else if (/^(تم|تمام|اوكي)$/i.test(userText.trim()) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
        } else {
            await sendWA(chatId, reply);
        }

        // تحديث التاريخ
        session.history.push({ role: "user", parts: [{ text: promptContent }] });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 8) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error:", err.message);
        // لا ترسل رسالة "السستم معلق" إذا كانت المشكلة بسيطة
        if (mediaUrl) {
            await sendWA(chatId, "يا غالي الفويس مش واضح عندي، بتقدر تكتب طلبك كتابة؟ أبشر باللي بدك اياه 🙏");
        }
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000);
