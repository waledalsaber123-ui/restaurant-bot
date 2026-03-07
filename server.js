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
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT // البرومبت اللي فيه المنيو والمناطق
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // فلترة الرسائل (نصوص، صور، فويسات)
    if (!["incomingMessageReceived", "incomingFileMessageReceived"].includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    let mediaUrl = body.messageData?.fileMessageData?.downloadUrl || null;

    // 1. بروتوكول الموقع الفوري (حل مشكلة التعليق في صورة 14)
    const locationKeywords = ["وينكم", "الموقع", "لوكيشن", "وين المحل", "وين موقعكم"];
    if (locationKeywords.some(key => userText.includes(key))) {
        await sendWA(chatId, "أبشر يا غالي، محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. \nوهذا اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
        return; 
    }

    try {
        // 2. منطق التأكيد المباشر للمطبخ (حل مشكلة صورة 10)
        if (/^(تم|تمام|اوكي|أوك|confirm)$/i.test(userText.trim()) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // 3. تجهيز المحتوى للـ AI (نصوص + وسائط)
        let promptContent = userText;
        if (mediaUrl) {
            promptContent += `\n[ملاحظة للمندوب: الزبون أرسل فويس أو صورة هنا: ${mediaUrl}. اسمع الفويس أو شوف الصورة ورد عليه بناءً على المنيو والأسعار.]`;
        }

        // 4. استدعاء Gemini 1.5 Flash (الأسرع للفويسات)
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] }, // حقن القواعد دائماً
                    ...session.history,
                    { role: "user", parts: [{ text: promptContent }] }
                ],
                generationConfig: { temperature: 0.1 } // دقة عالية للحسابات
            }, { timeout: 50000 } // وقت كافٍ لمعالجة الفويس
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        // 5. معالجة رد المطبخ
        if (reply.includes("[KITCHEN_GO]")) {
            session.lastKitchenMsg = reply.split("[KITCHEN_GO]")[1].trim();
            await sendWA(chatId, `${reply.split("[KITCHEN_GO]")[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ (بحد أقصى 10 رسائل لمنع البطء)
        session.history.push({ role: "user", parts: [{ text: promptContent }] });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 10) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error:", err.message);
        // رسالة ذكية بدل "معلق" في حال فشل الميديا
        if (mediaUrl) {
            await sendWA(chatId, "يا غالي الفويس مش واضح عندي، بتقدر تكتب طلبك كتابة؟ أبشر باللي بدك اياه 🙏");
        } else {
            await sendWA(chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
        }
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 Saber Smart Engine is Live & Stable!"));
