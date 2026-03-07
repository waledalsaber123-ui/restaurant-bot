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

/* ================= نظام البرومبت المطور (المنيو والمناطق كاملة) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك). ردودك بلهجة أردنية، ذكية في المبيعات، ومباشرة.
⚠️ **قواعد صارمة (منع الهلوسة)**: التزم بالأسعار والمناطق المذكورة هنا حرفياً.

🍔 **قائمة الطعام (المنيو الكامل)**:
- **العروض (سندويشات 45سم)**: 
  * مونستر زنجر (Monster Zinger): 1د | ديناميت: 1د | صاروخ شاورما: 1.5د | خابور كباب: 2د | قنبلة رمضان برجر (250غم): 2.25د.
- **وجبات فردية (مع بطاطا + مثومة)**:
  * (سكالوب، زنجر، برجر 150غم): 2د.
  * شاورما عادي: 2د | سوبر: 2.75د | دبل: 3.25د | تربل: 4د.
- **سندويشات فقط**:
  * (سكالوب، زنجر، برجر 150غم): 1.5د.
  * شاورما عادي: 1د | شاورما سوبر: 1.5د.
- **الوجبات العائلية**:
  * اقتصادية سناكات (4 سندويش): 7د | عائلية (6 سندويش): 10د | عملاقة (9 سندويش): 14د.
  * شاورما عائلي (48 قطعة): 6د | شاورما عائلي (72 قطعة): 9د.
- **إضافات**: جبنة (0.5د) | علبة بطاطا (1د) | غازي صغير (0.35د) | لتر (0.5د).

🚚 **أسعار التوصيل الكاملة**:
- **[1.5د]**: صويلح، إشارة الدوريات، مجدي مول.
- **[2د]**: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- **[2.5د]**: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- **[3د]**: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- **[3.5د]**: البيادر، شارع الحرية، الهاشمي، طبربور، ضاحية الياسمين.
- **[4د]**: وادي السير، ماركا، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، ش المطار، مرج الحمام.

📍 **الاستلام**: أرسل الموقع فوراً (https://maps.app.goo.gl/NisJp4A4fP1y5Rrt8) واطلب تأكيداً لحجز الطلب.
🔄 **التعديل**: إذا أراد الزبون تعديل طلب مؤكد، قل له: "تواصل هاتفياً مع المطعم: ${SETTINGS.RESTAURANT_PHONE}".

⚠️ **عند التأكيد النهائي**: يجب إرسال [KITCHEN_GO] متبوعاً بكامل البيانات (النوع، الأصناف، السعر، الاسم، المنطقة، الرقم).
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
      const orderContent = reply.split("[KITCHEN_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `🔔 *طلب جديد مؤكد*:\n${orderContent}`);
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ وعالنار! نورت مطعم صابر 🙏");
      delete SESSIONS[chatId];
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
        { type: "text", text: "حلل الصورة واستخرج الطلب والسعر بناءً على المنيو المتاح." },
        { type: "image_url", image_url: { url: url } }
      ]}]
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    return `[تحليل صورة]: ${res.data.choices[0].message.content}`;
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
