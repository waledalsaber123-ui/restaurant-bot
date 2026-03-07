import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    // تأكد إنك حاطط البرومبت في الـ Environment Variables بدون فراغات زائدة
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

    // 1. استجابة فورية للموقع (عشان ما يعلق حتى لو الـ API تعطل)
    const quickKeys = ["وينكم", "الموقع", "لوكيشن", "وين المحل"];
    if (quickKeys.some(k => userText.includes(k))) {
        await sendWA(chatId, "محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. وهذا اللوكيشن يا غالي: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
        return;
    }

    try {
        // 2. منطق التأكيد الفوري (صورة 1)
        if (/^(تم|تمام|ايوا|ok)$/i.test(userText) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // 3. استدعاء OpenAI مع تنظيف الـ History لمنع خطأ 400
        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SETTINGS.SYSTEM_PROMPT },
                    ...session.history.slice(-4), // تقليل الذاكرة لرسائل أقل عشان حجم البرومبت كبير
                    { role: "user", content: userText }
                ],
                temperature: 0
            },
            { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 30000 }
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
        console.error("❌ API Error:", err.response?.data || err.message);
        // رسالة بديلة ذكية في حالة الـ 400
        await sendWA(chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 Saber Engine is Stable Now!"));
