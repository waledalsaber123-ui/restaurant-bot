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
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // نستقبل الرسائل بس
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    let userText = body.messageData?.textMessageData?.textMessage || 
                   body.messageData?.extendedTextMessageData?.text;

    // 🚨 الضربة القاضية لمشكلة التعليق (Error 400):
    // إذا الزبون بعث فويس، ستيكر، أو صورة بدون نص، بنوقفه هون وما بنبعث لـ OpenAI
    if (!userText || userText.trim() === "") {
        await sendWA(chatId, "على راسي يا غالي، أنا حالياً بستقبل الطلبات كتابة بس. ياريت تكتب طلبك عشان أخدمك من عيوني 🙏");
        return;
    }

    userText = userText.trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    try {
        // الرد الفوري على الموقع
        if (/^(وينكم|الموقع|لوكيشن|وين المحل)$/i.test(userText)) {
            await sendWA(chatId, "محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. وهذا اللوكيشن يا غالي: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
            return;
        }

        // تأكيد الطلب
        if (/^(تم|تمام|ايوا|ok)$/i.test(userText) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // صمام أمان للـ SYSTEM_PROMPT عشان ما يبعث قيم فارغة
        const systemContent = SETTINGS.SYSTEM_PROMPT || "أنت صابر المساعد الذكي لمطعم صابر جو سناك. اطلب من الزبون كتابة اسمه ورقمه وطلبه بوضوح لمعالجة الطلب.";

        // تنظيف السجل من أي رسائل مخفية بتعمل Error
        const validHistory = session.history.filter(msg => msg.content && msg.content.trim() !== "");

        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemContent },
                    ...validHistory.slice(-4), // ناخذ آخر 4 رسائل نظيفة
                    { role: "user", content: userText }
                ],
                temperature: 0
            },
            { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 20000 }
        );

        let reply = aiResponse.data.choices[0].message.content;

        // فرز رد المطبخ
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, parts[0].trim() + "\n\nأكتب 'تم' للتأكيد ✅");
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ المحادثة
        session.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });

    } catch (err) {
        console.error("❌ API ERROR:", err.response?.data || err.message);
        await sendWA(chatId, "بعتذر منك يا غالي، السستم عم بحدث البيانات. ثواني وارجع ابعث رسالتك 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("✅ السستم تنظف واشتغل بدون أخطاء!"));
