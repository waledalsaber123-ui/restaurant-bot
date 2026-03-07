import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الشامل ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). تتحدث بلهجة أردنية ودودة.

⏰ ساعات الدوام: يومياً من 2:00 ظهراً حتى 3:30 فجراً.
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
💰 الدفع: كاش، كليك (0796893403)، أو زين كاش.

🔥 **قسم العروض (مهم جداً: إذا سأل الزبون عن العروض، اذكرها فوراً)**:
1. ساندويش ديناميت 45 سم (متوسط الحرارة) بـ 1 دينار.
2. صاروخ الشاورما 45 سم بـ 1.5 دينار.
3. قنبلة رمضان (برجر 250 غم، ارتفاع 17 سم) بـ 2.25 دينار.
4. خابور كباب (45 سم، وزن 250 غم) بـ 2 دينار.
5. عرض المونستر زنجر (من الصورة) بـ 1 دينار.

🍔 **المنيو الكامل**:
- الوجبة الاقتصادية (7د): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1 لتر غازي.
- الوجبة العائلية (10د): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2 لتر غازي.
- الوجبة العملاقة (14د): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3 لتر غازي.
- وجبة شاورما صدر (اقتصادية 6د / عائلية 9د).
- وجبات فردية (سكالوب، زنجر، برجر 150غم) مع بطاطا بـ 2 دينار.
- وجبات شاورما (عادي 2د، سوبر 2.75د، دبل 3.25د، تربل 4د).
- السندويشات: سكالوب (1.5د)، زنجر (1.5د)، برجر (1.5د)، شاورما (1د). (لتحويلها لوجبة ضف 1 دينار).

🚚 **أسعار التوصيل**:
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، جبل الحسين.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية.
- [3د]: الفحيص، الدوار (1-8)، عبدون، الصويفية، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي (شمالي/جنوبي)، طبربور، الياسمين.
- [4د]: وادي السير، ماركا، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، سحاب، مرج الحمام.

⚠️ **قواعد الإغلاق والطلب**:
1. عند اختيار الأصناف، أرسل فاتورة: (مجموع الأكل + التوصيل = الإجمالي الكلي).
2. لا تستخدم [KITCHEN_GO] إلا إذا توفر (الاسم، ورقم هاتف يبدأ بـ 07، والمنطقة/وقت الاستلام).
3. إذا قال الزبون "بكره" أو "أكد"، اجمع الطلب السابق مع التوقيت الجديد واعتمد الطلب.

بعد التأكيد، أرسل [KITCHEN_GO] بهذا التنسيق:
[KITCHEN_GO]
🔔 طلب جديد مؤكد:
- *النوع*: [توصيل أو استلام + الوقت]
- *الأصناف*: [التفاصيل]
- *السعر*: [المجموع]
- *الاسم*: [اسم الزبون]
- *المنطقة*: [المنطقة]
- *الرقم*: [رقم الزبون]
`;
};

/* ================= معالجة الرسائل ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData.chatId;
  const userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text || "";

  if (!userMessage || PROCESSED_MESSAGES.has(body.idMessage)) return;
  PROCESSED_MESSAGES.add(body.idMessage);

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  let session = SESSIONS[chatId];

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-12),
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // فحص ذكي: هل البيانات (اسم ورقم) موجودة في الرسالة الحالية أو الرد؟
    const hasPhone = /(07[789]\d{7})/.test(userMessage) || /(07[789]\d{7})/.test(reply);
    const hasName = (reply.includes("الاسم:") && !reply.includes("[اسم الزبون]")) || (userMessage.length > 3 && !userMessage.includes("عروض"));

    if (reply.includes("[KITCHEN_GO]")) {
      if (!hasPhone) {
        reply = "على راسي يا نشمي، بس ابعتلي رقم التلفون والاسم عشان نعتمد الطلب فوراً للمطبخ.";
      } else {
        const orderData = reply.split("[KITCHEN_GO]")[1].trim();
        await sendWA(SETTINGS.KITCHEN_GROUP, orderData);
        await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: "تم التأكيد وإرساله للمطبخ" });
        return;
      }
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (e) {}
}

app.listen(3000, () => console.log("Saber Bot Running..."));
