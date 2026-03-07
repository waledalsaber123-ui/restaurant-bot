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

    // دعم الرسائل النصية، الصور، والصوتيات
    const allowedTypes = ["incomingMessageReceived", "incomingFileMessageReceived"];
    if (!allowedTypes.includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { history: [], pendingOrder: {} };
    }
    const session = SESSIONS[chatId];

    let userContent = [];
    
    // 1. التعامل مع النصوص
    let text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
    if (text) userContent.push({ type: "text", text: text });

    // 2. التعامل مع الصور والفويسات (Media)
    if (body.typeWebhook === "incomingFileMessageReceived") {
        const fileUrl = body.messageData?.fileMessageData?.downloadUrl;
        if (fileUrl) {
            userContent.push({ type: "image_url", image_url: { url: fileUrl } }); // للصور
            // ملاحظة: للفويسات، يفضل استخدام مكتبة تحويل الصوت لنص أو تمرير الرابط إذا كان الموديل يدعمها مباشرة
        }
    }

    if (userContent.length === 0) return;

    try {
        // منطق التأكيد السريع
        if (text && /^(تم|ok|تمام|اوكي)$/i.test(text.trim()) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // إرسال لـ Gemini (المندوب الذكي)
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] },
                    ...session.history,
                    { role: "user", parts: userContent }
                ]
            }
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        // معالجة كود المطبخ
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            session.awaitingConfirmation = true;
            await sendWA(chatId, `${parts[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ
        session.history.push({ role: "user", parts: userContent });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 12) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error:", err.message);
        await sendWA(chatId, "على راسي يا غالي، بس السستم معلق شوي. ارجع ابعث رسالتك كمان دقيقة 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 صابر الذكي شغال (نصوص + صور)!"));
