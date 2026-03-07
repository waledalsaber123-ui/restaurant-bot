import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    // استخدمنا مفتاح OpenAI بناءً على الكود اللي كان شغال عندك أول مرة
    API_KEY: process.env.OPENAI_KEY, 
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userText = (body.messageData?.textMessageData?.textMessage || 
                   body.messageData?.extendedTextMessageData?.text || "").trim();

    // --- صمام الأمان للموقع (حل مشكلة صورة 13 و 14) ---
    const fastResponse = userText.toLowerCase();
    if (fastResponse.includes("موقع") || fastResponse.includes("لوكيشن") || fastResponse.includes("وينكم")) {
        await sendWA(chatId, "أبشر يا غالي، موقعنا بعمان - شارع الجامعة - طلوع هافانا 📍\nاللوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9");
        return;
    }

    try {
        // منطق التأكيد الفوري
        if (/^(تم|تمام|اوكي|ok)$/i.test(userText) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // استدعاء AI - مع التأكد من إرسال الـ System Prompt بشكل صحيح
        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SETTINGS.SYSTEM_PROMPT },
                    ...session.history.slice(-6), // تقليل التاريخ لمنع خطأ 400
                    { role: "user", content: userText }
                ],
                temperature: 0
            },
            { 
                headers: { "Authorization": `Bearer ${SETTINGS.API_KEY}` },
                timeout: 25000 
            }
        );

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            session.lastKitchenMsg = reply.split("[KITCHEN_GO]")[1].trim();
            await sendWA(chatId, reply.split("[KITCHEN_GO]")[0].trim() + "\n\nأكتب 'تم' للتأكيد ✅");
        } else {
            await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });

    } catch (err) {
        console.error("❌ Error 400 Detect:", err.response?.data || err.message);
        // في حال فشل الـ AI، لا تبعث "معلق"، بل ابعث رد بديل ذكي
        await sendWA(chatId, "يا غالي، المحل حالياً عنده ضغط طلبات عالي. بتقدر تطلب مباشرة أو تسألني عن المنيو؟ أبشر باللي بدك اياه 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 Saber Engine Fix Deployed!"));
