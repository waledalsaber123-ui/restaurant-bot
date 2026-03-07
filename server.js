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
    // هنا يتم سحب نص البرومبت الطويل (المنيو والمناطق) من إعدادات السيرفر
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

    try {
        // 1. بروتوكول الموقع الفوري (حل مشكلة التعليق في الصور 3 و 4)
        if (/^(وينكم|الموقع|لوكيشن|وين المحل)$/i.test(userText)) {
            await sendWA(chatId, "محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. وهذا اللوكيشن يا غالي: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
            return;
        }

        // 2. منطق التأكيد للمطبخ (صورة 1 و 2)
        if (/^(تم|تمام|ايوا|ok)$/i.test(userText) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // 3. استدعاء OpenAI مع مراعاة حجم البرومبت
        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // أفضل موديل للتعامل مع المنيو الطويل بسرعة
                messages: [
                    { role: "system", content: SETTINGS.SYSTEM_PROMPT },
                    ...session.history.slice(-4), // تقليل التاريخ لمنع خطأ 400 بسبب ضخامة البرومبت
                    { role: "user", content: userText }
                ],
                temperature: 0
            },
            { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 25000 }
        );

        let reply = aiResponse.data.choices[0].message.content;

        // 4. فرز الرد (مطبخ أم زبون)
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, parts[0].trim() + "\n\nأكتب 'تم' للتأكيد ✅");
        } else {
            await sendWA(chatId, reply);
        }

        // تحديث السجل
        session.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });
        if (session.history.length > 8) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ API ERROR 400:", err.response?.data || err.message);
        // رسالة "ضغط الخط" في حال فشل الـ API (صورة 3)
        await sendWA(chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🤖 Saber Engine Live & Ready!"));
