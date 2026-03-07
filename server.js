import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT // سحب البرومبت من البيئة
};

const SESSIONS = {};

// دالة تنظيف الجلسات القديمة
setInterval(() => {
    const now = Date.now();
    for (const id in SESSIONS) {
        if (now - SESSIONS[id].lastSeen > 3600000) delete SESSIONS[id]; 
    }
}, 600000);

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    // تهيئة الجلسة
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { 
            history: [], 
            pendingOrder: null, 
            awaitingConfirmation: false,
            lastSeen: Date.now() 
        };
    }
    const session = SESSIONS[chatId];
    session.lastSeen = Date.now();

    let userMessage = body.messageData?.textMessageData?.textMessage || 
                      body.messageData?.extendedTextMessageData?.text;
    if (!userMessage) return;

    // منطق التحويل لـ "استلام" يدوياً لضمان الدقة قبل الـ AI
    if (session.pendingOrder && (userMessage.includes("استلام") || userMessage.includes("بالمحل"))) {
        session.pendingOrder.type = "pickup";
        session.pendingOrder.deliveryFee = 0;
        session.pendingOrder.total = session.pendingOrder.subtotal;
    }

    try {
        // التحقق من كلمة التأكيد "تم"
        const isConfirmation = /^(تم|ok|اوكي|تمام|ايوا|confirm)$/i.test(userMessage.trim());
        
        if (session.awaitingConfirmation && isConfirmation && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        // إرسال لـ OpenAI
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SETTINGS.SYSTEM_PROMPT },
                ...session.history.slice(-10),
                { role: "user", content: userMessage }
            ],
            temperature: 0
        }, { 
            headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` },
            timeout: 30000 
        });

        let reply = aiResponse.data.choices[0].message.content;

        // معالجة كود المطبخ إذا ظهر في رد الـ AI
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            const customerPart = parts[0].trim();
            const kitchenPart = parts[1].trim();

            session.lastKitchenMsg = kitchenPart;
            session.awaitingConfirmation = true;

            // استخراج بيانات الطلب للذاكرة
            session.pendingOrder = {
                subtotal: kitchenPart.match(/الحساب:?\s*([0-9.]+)/)?.[1] || "0",
                total: kitchenPart.match(/المجموع:?\s*([0-9.]+)/)?.[1] || "0",
                type: kitchenPart.includes("استلام") ? "pickup" : "delivery"
            };

            await sendWA(chatId, `${customerPart}\n\nأكتب "تم" للتأكيد ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

    } catch (err) {
        console.error("❌ Error:", err.message);
        await sendWA(chatId, "على راسي يا غالي، بس صار عندي ضغط صغير. ارجع ابعث رسالتك كمان مرة 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 Saber Engine is Running!"));
