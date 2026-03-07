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
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT // الموقع والمنيو والأسعار هنا
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;

    // دعم الرسائل النصية، الصور، والفويسات
    const allowedTypes = ["incomingMessageReceived", "incomingFileMessageReceived"];
    if (!allowedTypes.includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userContent = [];

    // 1. معالجة النصوص
    let text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
    if (text) userContent.push({ text: text });

    // 2. معالجة الوسائط (صور + فويس) - حل مشكلة صورة 11
    if (body.typeWebhook === "incomingFileMessageReceived") {
        const fileUrl = body.messageData?.fileMessageData?.downloadUrl;
        const fileName = body.messageData?.fileMessageData?.fileName || "";
        
        if (fileUrl) {
            // إذا كان فويس أو صورة، بنمرره للموديل كـ URI
            userContent.push({
                text: `[تحذير للمندوب: الزبون أرسل ملف وسائط (صورة أو فويس) موجود هنا: ${fileUrl}. قم بتحليله والرد عليه بناءً على محتواه وعلى المنيو الخاص بنا.]`
            });
        }
    }

    if (userContent.length === 0) return;

    try {
        // منطق التأكيد السريع لتقليل الأخطاء (صورة 10)
        if (text && /^(تم|تمام|اوكي|أوك|confirm)$/i.test(text.trim()) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // إرسال لـ Gemini (حل مشكلة الموقع في صورة 12)
        const aiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] }, // حقن الموقع والمنيو دائماً
                    ...session.history,
                    { role: "user", parts: userContent }
                ],
                generationConfig: { temperature: 0.2 }
            }
        );

        let reply = aiResponse.data.candidates[0].content.parts[0].text;

        // معالجة كود المطبخ
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, `${parts[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ (نصوص فقط لتوفير الذاكرة)
        session.history.push({ role: "user", parts: userContent.filter(p => p.text) });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 10) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error:", err.message);
        await sendWA(chatId, "على راسي يا غالي، السستم معلق شوي. ارجع ابعث رسالتك أو الفويس كمان مرة 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 مندوب صابر الذكي شغال (نصوص + فويس + موقع)!"));
