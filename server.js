import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  RESTAURANT_PHONE: "0796893403",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت (المناطق كاملة + حجز الاستلام بالوقت) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). 
⚠️ **قواعد العمل (إجبارية)**:
1. **حجز الاستلام**: لا ترفض الحجز أبداً. إذا طلب الزبون استلام، اسأله "أي ساعة حابب يكون طلبك جاهز؟" وثبّت الوقت في المطبخ.
2. **فهم الصور**: أي صورة عرض (مثل المونستر زنجر) أضفها فوراً بسعرها (1د).
3. **التوصيل**: التزم بأسعار المناطق أدناه حرفياً.

🍔 **المنيو الرسمي**:
- عروض 45سم: مونستر زنجر (1د)، ديناميت (1د)، صاروخ شاورما (1.5د)، خابور كباب (2د)، قنبلة رمضان (2.25د).
- وجبات: (زنجر/سكالوب/برجر: 2د)، شاورما عادي: 2د، سوبر: 2.75د، دبل: 3.25د.
- سندويشات: (زنجر/سكالوب/برجر: 1.5د)، شاورما عادي: 1د، شاورما سوبر: 1.5د.
- عائلي: سناكات 4 (7د)، 6 (10د)، 9 (14د). شاورما 48 قطعة (6د)، 72 قطعة (9د).

🚚 **قائمة مناطق التوصيل الكاملة (التزام تام بالأسعار)**:
- **[1.5د]**: صويلح، إشارة الدوريات، مجدي مول.
- **[2د]**: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- **[2.5د]**: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- **[3د]**: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- **[3.5د]**: البيادر، شارع الحرية، الهاشمي الشمالي، الهاشمي الجنوبي، طبربور، ضاحية الياسمين.
- **[4د]**: وادي السير، ماركا الشمالية، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، مرج الحمام، سحاب، طريق المطار (بعد جسر مادبا).

⚠️ **عند التأكيد (استلام أو توصيل)**:
أرسل [KITCHEN_GO] متبوعاً بـ:
- نوع الطلب + **وقت الاستلام المحدد**.
- ملخص الأصناف والمجموع.
- بيانات الزبون (الاسم، المنطقة، الرقم).
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived" && body.typeWebhook !== "incomingFileMessageReceived") return;

  const messageId = body.idMessage;
  if (PROCESSED_MESSAGES.has(messageId)) return;
  PROCESSED_MESSAGES.add(messageId);

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = "";
  if (body.messageData?.typeMessage === "textMessage" || body.messageData?.typeMessage === "extendedTextMessage") {
    userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text;
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData.fileMessageData.mimeType.includes("image")) {
    userMessage = await analyzeImage(body.messageData.fileMessageData.downloadUrl);
  }

  if (!userMessage) return;

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-10),
        { role: "user", content: userMessage }
      ],
      temperature: 0 // للالتزام التام بالوقت والأسعار
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const finalOrder = reply.split("[KITCHEN_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `✅ *طلب جديد مؤكد*:\n${finalOrder}`);
      await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

/* ================= تحليل الصور ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [
        { type: "text", text: "استخرج الطلب من الصورة لشرائه فوراً بسعر المنيو." },
        { type: "image_url", image_url: { url: url } }
      ]}]
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    return `[الزبون اختار هذا العرض من الصورة]: ${res.data.choices[0].message.content}`;
  } catch (err) { return "صورة عرض"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Complete Zones Live!"));
