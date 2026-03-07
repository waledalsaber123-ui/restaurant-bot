import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    // استخدمنا GEMINI_KEY لضمان فهم الفويسات والصور بأعلى دقة
    GEMINI_KEY: process.env.GEMINI_API_KEY || process.env.OPENAI_KEY, 
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT // هنا يسحب المنيو والمناطق من الـ Environment
};

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // دعم النصوص والوسائط (فويس/صور)
    if (!["incomingMessageReceived", "incomingFileMessageReceived"].includes(body.typeWebhook)) return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    let userText = body.messageData?.textMessageData?.textMessage || 
                  body.messageData?.extendedTextMessageData?.text || "";
    let mediaUrl = body.messageData?.fileMessageData?.downloadUrl || null;

    try {
        // 1. منطق التأكيد الفوري (تم / استلام) لتقليل الضغط
        if (/^(تم|تمام|اوكي|ok|confirm)$/i.test(userText.trim()) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // 2. تجهيز المحتوى (حقن رابط الميديا إذا وجد)
        let promptInput = userText;
        if (mediaUrl) {
            promptInput += `\n[ملاحظة: الزبون أرسل ميديا (فويس/صورة) هنا: ${mediaUrl}. حللها ورد بناءً على المنيو.]`;
        }

        // 3. استدعاء الموديل (Gemini 1.5 Flash) الأفضل في قراءة الـ SYSTEM_PROMPT الطويل
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${SETTINGS.GEMINI_KEY}`,
            {
                contents: [
                    { role: "user", parts: [{ text: SETTINGS.SYSTEM_PROMPT }] }, // سحب المنيو والمناطق
                    ...session.history,
                    { role: "user", parts: [{ text: promptInput }] }
                ],
                generationConfig: { temperature: 0.1 } // دقة عالية في الحسابات
            }, { timeout: 45000 }
        );

        let reply = response.data.candidates[0].content.parts[0].text;

        // 4. معالجة رد المطبخ
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, `${parts[0].trim()}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ (بحد أقصى 8 رسائل)
        session.history.push({ role: "user", parts: [{ text: promptInput }] });
        session.history.push({ role: "model", parts: [{ text: reply }] });
        if (session.history.length > 8) session.history.splice(0, 2);

    } catch (err) {
        console.error("❌ Error:", err.message);
        // رسالة ذكية بدل "معلق"
        await sendWA(chatId, "على راسي يا غالي، ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("🚀 صابر جو سناك جاهز ويعتمد على SYSTEM_PROMPT!"));
