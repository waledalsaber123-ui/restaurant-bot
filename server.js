import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= المساعدة في استخراج البيانات ================= */
const extractPhone = (text) => {
    const match = text.match(/(07[789][0-9]{7})/);
    return match ? match[0] : null;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    // التأكد من أنها رسالة واردة (واتساب أو مسنجر)
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    // التحقق: إذا كانت رسالة من جروب، تجاهلها (إلا لو كان جروب المطبخ)
    if (!chatId || (chatId.endsWith("@g.us") && chatId !== SETTINGS.KITCHEN_GROUP)) return;

    // 1. تهيئة الجلسة لمرة واحدة فقط
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { 
            history: [], 
            pendingOrder: { items: [], total: 0, type: "delivery" },
            awaitingConfirmation: false 
        };
    }
    const session = SESSIONS[chatId];

    let userMessage = body.messageData?.textMessageData?.textMessage || 
                      body.messageData?.extendedTextMessageData?.text || "";

    if (!userMessage) return;

    // 2. تحديث البيانات بشكل تلقائي
    const detectedPhone = extractPhone(userMessage);
    if (detectedPhone) session.pendingOrder.phone = detectedPhone;

    // 3. التعامل مع خيار الاستلام
    if (userMessage.includes("استلام") || userMessage.includes("بالمحل")) {
        session.pendingOrder.type = "pickup";
        session.pendingOrder.deliveryFee = 0;
    }

    try {
        // 4. التحقق من التأكيد النهائي
        const isConfirmation = /^(تم|ok|اوكي|confirm|yes|اكيد|ايوا|تمام|okay|yep|yeah)$/i.test(userMessage.trim());
        
        if (session.awaitingConfirmation && isConfirmation) {
            const order = session.pendingOrder;
            const kitchenMessage = `[KITCHEN_GO]\n🔥 *طلب جديد مؤكد*\n- *الاسم*: ${order.name || "زبون"}\n- *الرقم*: ${order.phone || "غير محدد"}\n- *النوع*: ${order.type === "pickup" ? "استلام 🚶" : "توصيل 🚚"}\n- *الطلب*: ${order.itemsString}\n- *المجموع*: ${order.total} د.أ`;
            
            await sendWA(SETTINGS.KITCHEN_GROUP, kitchenMessage);
            await sendWA(chatId, `تم بحمد الله يا غالي! ✅\nطلبك صار عند المطبخ وبيجهز خلال 30-45 دقيقة.`);
            
            delete SESSIONS[chatId]; // تصفير الجلسة بعد النجاح
            return;
        }

        // 5. إرسال لـ OpenAI
        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: getSystemPrompt() },
                    ...session.history.slice(-6),
                    { role: "user", content: userMessage }
                ],
                temperature: 0.2
            },
            { headers: { "Authorization": `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 30000 }
        );

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            // استخراج البيانات وتخزينها في السيشين
            session.awaitingConfirmation = true;
            const parts = reply.split("[KITCHEN_GO]");
            const kitchenInfo = parts[1];

            session.pendingOrder.itemsString = kitchenInfo.match(/الطلب:? ([^\n]+)/)?.[1] || "مشكل";
            session.pendingOrder.total = kitchenInfo.match(/المجموع الكلي:? ([0-9.]+)/)?.[1] || "0";
            session.pendingOrder.name = kitchenInfo.match(/الاسم:? ([^\n]+)/)?.[1] || "غالي";

            await sendWA(chatId, `${parts[0].trim()}\n\n*هل البيانات صحيحة؟ أكتب "تم" للتأكيد* ✅`);
        } else {
            await sendWA(chatId, reply);
        }

        // حفظ التاريخ
        session.history.push({ role: "user", content: userMessage });
        session.history.push({ role: "assistant", content: reply });

    } catch (err) {
        console.error("Error:", err.message);
        await sendWA(chatId, "أبشر يا غالي، ثواني وبكون معك، صار عندي ضغط رسائل.");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (err) {
        console.error("Send Error:", err.message);
    }
}

app.listen(3000, () => console.log("🤖 صابر جاهز على كل المنصات!"));
