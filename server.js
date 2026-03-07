import express from "express";
import axios from "axios";
// ... باقي الـ imports كما هي عندك

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
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الموحد (نسخة واحدة فقط) ================= */
const getSystemPrompt = () => {
  return `
📍 **معلومات الموقع والتواصل**:
- العنوان الرسمي: عمان - شارع الجامعة الأردنية - طلوع هافانا.
- فرعنا الوحيد: يوجد لدينا فرع واحد فقط حالياً.
- لوكيشن المحل: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9

⏰ **ساعات الدوام**:
- نفتح يومياً من الساعة 2:00 ظهراً وحتى الساعة 3:30 فجراً.

💰 **طرق الدفع المتاحة**:
1. كاش عند الاستلام.
2. تحويل CliQ على الرقم: 0796893403.
3. زين كاش.

أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). 

🍔 **المنيو الرسمي**:
(هنا اترك المنيو ومناطق التوصيل كما هي في كودك الأصلي تماماً دون تغيير)

⚠️ **قواعد الإرسال للمطبخ (صارمة)**:
- لا ترسل [KITCHEN_GO] إلا إذا توفر (الاسم، رقم الهاتف 07، الموقع أو استلام).
- التنسيق الإجباري بعد الكود:
  [KITCHEN_GO]
  🔔 طلب جديد مؤكد!
  الاسم: [اسم الزبون]
  الرقم: [رقم الزبون]
  العنوان: [المنطقة أو استلام]
  الطلب: [الأصناف والمجموع]
`;
};

/* ================= المحرك الرئيسي المصلح ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
  if (!userMessage) return;

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-15),
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // إصلاح معالجة الطلب للمطبخ والزبون
    if (reply.includes("[KITCHEN_GO]")) {
      const orderData = reply.split("[KITCHEN_GO]")[1]?.trim();
      const hasPhone = /(07[789]\d{7})/.test(reply);
      const hasName = reply.includes("الاسم") && !reply.includes("[اسم الزبون]");

      if (!hasPhone || !hasName || !orderData) {
        reply = "على راسي يا غالي، بس ياريت تعطيني (الاسم ورقم التلفون) عشان أثبت الطلب وأبعته للمطبخ فوراً.";
        await sendWA(chatId, reply);
      } else {
        // إرسال للمطبخ
        await sendWA(SETTINGS.KITCHEN_GROUP, orderData);
        // إرسال تأكيد للزبون
        await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
        
        setTimeout(() => { if (SESSIONS[chatId]) delete SESSIONS[chatId]; }, 86400000);
        return;
      }
    } else {
      await sendWA(chatId, reply);
    }

    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot Fixed & Running!"));
