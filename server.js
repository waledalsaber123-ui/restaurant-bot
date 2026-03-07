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
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT // تأكد إنك حطيت البرومبت الجديد هون
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;

    const allowedTypes = ["incomingMessageReceived", "incomingFileMessageReceived"];
    if (!allowedTypes.includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userParts = [];

    // 1. استخراج النص
    let text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
    if (text) userParts.push({ text: text });

    // 2. معالجة الفويس والصور (حل مشكلة صورة 11)
    if (body.typeWebhook === "incomingFileMessageReceived") {
        const fileUrl = body.messageData?.fileMessageData?.downloadUrl;
        if (fileUrl) {
            // نمرر الرابط كنص إرشادي للموديل ليقوم بتحليله
            userParts.push({ 
                text: `[نظام صابر]: الزبون أرسل ميديا (فويس أو صورة) هنا: ${fileUrl}. اسمعها أو شاهدها ورد بناءً على المنيو والموقع اللي عندك.` 
            });
        }
    }

    if (userParts.length === 0) return;

    try {
        // حقن البرومبت في كل طلب (حل مشكلة صورة 12 - الموقع)
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] }, // ضمان رؤية الموقع دائماً
                    ...session.history,
                    { role: "user", parts: userParts }
                ]
            },
            { timeout: 60000 } // زيادة وقت الانتظار للفويسات
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        if (reply.includes("[KITCHEN_GO]")) {
            session.lastKitchenMsg = reply.split("[KITCHEN_GO]")[1].trim();
            await sendWA(chatId, `${reply.split("[KITCHEN_GO]")[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ لتجنب نسيان الطلب (صورة 10)
        session.history.push({ role: "user", parts: userParts });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 10) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error Details:", err.response?.data || err.message);
        // رسالة تنبيه للزبون بدل "السستم معلق"
        await sendWA(chatId, "أبشر يا غالي، بس جرب ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 Saber Smart Engine Updated!"));
