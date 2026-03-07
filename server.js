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

/* ================= نظام البرومبت (الحجز المباشر ومنع النسيان) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك). ردودك بلهجة أردنية، ذكية، ومباشرة جداً.
⚠️ **ممنوع رفض الحجز**: لا تقل للزبون "لا أستطيع الحجز". أنت مبرمج لتأكيد كل الطلبات (استلام أو توصيل) وترحيلها للمطبخ فوراً.

🍔 **المنيو الكامل (التزم بالأسعار حرفياً)**:
- **عروض 45سم**: مونستر زنجر (1د)، ديناميت (1د)، صاروخ شاورما (1.5د)، خابور كباب (2د)، قنبلة رمضان برجر 250غم (2.25د).
- **وجبات فردية (بطاطا + صوص)**: (زنجر، سكالوب، برجر: 2د)، شاورما عادي: 2د، سوبر: 2.75د، دبل: 3.25د، تربل: 4د.
- **سندويشات فقط**: (زنجر، سكالوب، برجر: 1.5د)، شاورما عادي: 1د، شاورما سوبر: 1.5د.
- **عائلي**: سناكات 4 (7د)، عائلية 6 (10د)، عملاقة 9 (14د)، شاورما 48 قطعة (6د)، شاورما 72 قطعة (9د).
- **إضافات**: علبة بطاطا (1د)، جبنة (0.5د)، غازي صغير (0.35د)، لتر (0.5د).

🚚 **أسعار التوصيل الكاملة**:
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، نزال، النزهة، طريق المطار، البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي، طبربور، الياسمين.
- [4د]: وادي السير، ماركا، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، المنارة، مرج الحمام.

📍 **قواعد التعامل**:
1. **في حال الاستلام**: أرسل الموقع (https://maps.app.goo.gl/NisJp4A4fP1y5Rrt8) وأكد الحجز فوراً. قل له "اعتمد الطلب عشان نجهزه؟".
2. **في حال التوصيل**: اطلب (الاسم، المنطقة، الرقم).
3. **فهم الصور**: إذا أرسل صورة عرض (مثل المونستر)، افهم فوراً أنه يريد هذا العرض بسعر 1د وأضفه للطلب.

⚠️ **التأكيد النهائي**: عندما يوافق الزبون، أرسل الكود [KITCHEN_GO] متبوعاً بملخص شامل (النوع، الأصناف والأسعار، المجموع، بيانات الزبون).
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const messageId = body.idMessage;

  if (body.typeWebhook !== "incomingMessageReceived" && body.typeWebhook !== "incomingFileMessageReceived") return;
  if (PROCESSED_MESSAGES.has(messageId)) return;
  PROCESSED_MESSAGES.add(messageId);
  setTimeout(() => PROCESSED_MESSAGES.delete(messageId), 600000);

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = "";
  if (body.messageData?.typeMessage === "textMessage" || body.messageData?.typeMessage === "extendedTextMessage") {
    userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text;
  } 
  else if (body.typeWebhook === "incomingFileMessageReceived") {
    const fileData = body.messageData.fileMessageData;
    if (fileData.mimeType.includes("image")) {
      userMessage = await analyzeImage(fileData.downloadUrl);
    } else if (fileData.mimeType.includes("audio")) {
      userMessage = await transcribeVoice(fileData.downloadUrl);
    }
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
      temperature: 0.1 
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const orderData = reply.split("[KITCHEN_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `🔔 *طلب مؤكد وجاهز للتجهيز*:\n${orderData}`);
      await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
      delete SESSIONS[chatId]; // مسح الجلسة فقط بعد الإرسال الناجح للمطبخ
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

/* ================= وظائف المساعدة ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [
        { type: "text", text: "استخرج اسم الوجبة والعرض من هذه الصورة لطلبها فوراً." },
        { type: "image_url", image_url: { url: url } }
      ]}]
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    return `[الزبون يريد هذا العرض من الصورة]: ${res.data.choices[0].message.content}`;
  } catch (err) { return "صورة مستلمة"; }
}

async function transcribeVoice(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const filePath = path.join("/tmp", `v_${Date.now()}.ogg`);
    fs.writeFileSync(filePath, Buffer.from(response.data));
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "whisper-1");
    const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });
    fs.unlinkSync(filePath);
    return res.data.text;
  } catch (err) { return "صوت مستلم"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Jo Snack Bot Live!"));
