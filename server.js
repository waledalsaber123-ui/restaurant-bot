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

// وضعنا البرومبت داخل الكود مباشرة لضمان عدم ضياعه أو التسبب بخطأ 400
const SYSTEM_PROMPT = `
أنت "صابر"، المساعد الذكي لمطعم "صابر جو سناك". 
تتحدث بلهجة أردنية نشمية (يا غالي، أبشر، من عيوني).

📍 معلومات أساسية:
- الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا. اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9
- الدوام: 10:00 صباحاً حتى 3:30 فجراً.
- الخدمة: استلام أو توصيل فقط (لا يوجد حجز طاولات أبداً).

⚠️ قواعد صارمة جداً:
1. ممنوع عمل Upsell نهائياً (لا تقترح إضافات لم يطلبها الزبون).
2. إجبار الزبون على إعطاء (الاسم) و (رقم الهاتف) لتأكيد الطلب.
3. ميز دائماً بين الساندويش والوجبة. (لتحويل أي ساندويش إلى وجبة يضاف 1 دينار).

🍔 المنيو:
- ساندويش (زنجر، سكالوب، برجر 150غم) = 1.5 دينار.
- وجبات فردية (سندويشة+بطاطا+بيبسي) = 2.0 دينار.
- ديناميت زنجر (40 سم) = 1.0 دينار.
- عائلية اقتصادية (7 دنانير): 4 ساندويشات+بطاطا+بيبسي.
- عائلية (10 دنانير): 6 ساندويشات+2 بطاطا+مشروب.
- العمالقة (14 دينار): 9 ساندويشات+3 بطاطا+مشروب.
- شاورما: عادي (1)، سوبر (1.5). وجبات الشاورما: عادي (2)، سوبر (2.75).

🚚 التوصيل (لا تخمن أبداً، اجمع السعر الكلي بدون تقريب للكسور):
- (1.5 د.أ): صويلح، مجدي مول.
- (2.0 د.أ): الجامعة الأردنية، الجبيهة، تلاع العلي، شارع مكة، ضاحية الرشيد.
- (2.5 د.أ): خلدا، دابوق، الشميساني، الجاردنز، العبدلي.
- (3.0 د.أ): عبدون، جبل عمان، طبربور، الدوار 1-8.
(إذا لم تكن المنطقة مذكورة، أعطِ سعراً تقريبياً للمنطقة الأقرب).

✅ عند النهاية، أرسل الكود التالي:
[KITCHEN_GO]
الاسم: [الاسم]
الرقم: [الرقم]
العنوان: [المنطقة]
الطلب: [التفاصيل]
المجموع: [السعر]
`;

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    if (!chatId || chatId.endsWith("@g.us")) return;

    let userText = body.messageData?.textMessageData?.textMessage || 
                   body.messageData?.extendedTextMessageData?.text;

    // منع الفويسات والصور من عمل Error 400
    if (!userText || userText.trim() === "") {
        await sendWA(chatId, "على راسي يا غالي، ياريت تكتب طلبك كتابة عشان أخدمك بأسرع وقت 🙏");
        return;
    }

    userText = userText.trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    try {
        // رد سريع جداً للموقع (Hardcoded Bypass)
        if (/^(وينكم|الموقع|لوكيشن|وين المحل|موقعكم)$/i.test(userText)) {
            await sendWA(chatId, "محلنا بعمان - شارع الجامعة الأردنية - طلوع هافانا. وهذا اللوكيشن يا غالي: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9 📍");
            return;
        }

        if (/^(تم|تمام|ايوا|ok)$/i.test(userText) && session.lastKitchenMsg) {
            await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
            await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
            delete SESSIONS[chatId];
            return;
        }

        const validHistory = session.history.filter(msg => msg.content && msg.content.trim() !== "");

        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...validHistory.slice(-4), // 4 رسائل فقط لمنع Error 400
                    { role: "user", content: userText }
                ],
                temperature: 0
            },
            { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 20000 }
        );

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim();
            await sendWA(chatId, parts[0].trim() + "\n\nأكتب 'تم' للتأكيد ✅");
        } else {
            await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });

    } catch (err) {
        console.error("❌ API ERROR:", err.response?.data || err.message);
        await sendWA(chatId, "بعتذر منك يا غالي، السستم عليه ضغط. ثواني وارجع ابعث رسالتك 🙏");
    }
});

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
    } catch (e) {}
}

app.listen(3000, () => console.log("✅ صابر شغال 100% والبرومبت محمي داخل الكود!"));
