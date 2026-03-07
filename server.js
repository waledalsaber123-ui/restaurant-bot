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
  RESTAURANT_PHONE: "0796893403", // رقم المطعم للتواصل المباشر
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الشامل ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك - Saber Jo Snack). ردودك بلهجة أردنية، ذكية، ومباشرة.

📍 **موقع المطعم**: عمان، شارع الجامعة الأردنية، طلوع هافانا.
🔗 الموقع: https://maps.app.goo.gl/NisJp4A4fP1y5Rrt8
⏰ الدوام: 2:00 مساءً - 3:30 فجراً.
💰 الدفع: كاش، CliQ (0796893403)، زين كاش.

⚠️ **قواعد هامة جداً**:
1. **الاستلام**: أرسل رابط الموقع فوراً + اطلب تأكيد صريح قبل الإرسال للمطبخ. عند التأكيد أرسل [PICKUP_GO].
2. **التوصيل**: اطلب (الاسم، المنطقة، الهاتف). عند التأكيد أرسل [KITCHEN_GO].
3. **تعديل الطلب**: إذا طلب العميل تعديل أو تغيير أو إلغاء لطلب "تم تأكيده سابقاً"، أخبره بضرورة الاتصال هاتفياً فوراً على الرقم: ${SETTINGS.RESTAURANT_PHONE}.

🍔 **المنيو الكامل**:
- العروض (45سم): ديناميت (1د)، صاروخ شاورما (1.5د)، خابور كباب (2د)، قنبلة رمضان (2.25د).
- وجبات (مع بطاطا): (زنجر/سكالوب/برجر: 2د)، شاورما عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د).
- سندويشات فقط: (زنجر/سكالوب/برجر: 1.5د)، شاورما عادي (1د)، سوبر (1.5د).
- عائلي: سناكات 4 (7د)، 6 (10د)، 9 (14د). شاورما 48 قطعة (6د)، 72 قطعة (9د).
- إضافات: جبنة (0.5)، بطاطا (1)، غازي صغير (0.35)، لتر (0.5).

🚚 **أسعار التوصيل**:
- [1.5د]: صويلح، الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة، الرشيد، تلاع العلي، حي الجامعة، خلدا، الواحة، مشفى الحرمين، الصحافة، جبل الحسين، التخصصي.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، نزال، النزهة، طريق المطار، البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي، طبربور، الياسمين.
- [4د]: وادي السير، ماركا، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، المنارة، ش المطار، مرج الحمام.
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

  // إذا كانت الجلسة غير موجودة (يعني العميل بدأ من جديد بعد تأكيد طلب سابق) 
  // وحاول العميل "تعديل" الطلب، البوت سيفهم من السياق بناءً على البرومبت.
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = "";
  if (body.messageData?.typeMessage === "textMessage" || body.messageData?.typeMessage === "extendedTextMessage") {
    userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text;
  } 
  else if (body.typeWebhook === "incomingFileMessageReceived") {
    const fileData = body.messageData.fileMessageData;
    if (fileData.mimeType.includes("audio")) {
      userMessage = await transcribeVoice(fileData.downloadUrl);
    } else if (fileData.mimeType.includes("image")) {
      userMessage = await analyzeImage(fileData.downloadUrl);
    }
  }

  if (!userMessage) return;

  // فحص يدوي إضافي لكلمات التعديل إذا كانت الجلسة قد انتهت (لزيادة الدقة)
  const keywords = ["تعديل", "تغيير", "الغاء", "الغي", "عدل", "غيرت رائي"];
  const isAskingToModify = keywords.some(k => userMessage.includes(k));

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

    // 1. ترحيل طلب التوصيل
    if (reply.includes("[KITCHEN_GO]")) {
      const orderContent = reply.split("[KITCHEN_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `🚚 *طلب توصيل جديد*:\n${orderContent}`);
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ وعالنار! الدليفري رح يتواصل معك. نورت مطعم صابر 🙏");
      delete SESSIONS[chatId]; // إنهاء الجلسة بعد التأكيد
      return;
    }

    // 2. ترحيل طلب الاستلام
    if (reply.includes("[PICKUP_GO]")) {
      const orderContent = reply.split("[PICKUP_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `🏃‍♂️ *طلب استلام من المطعم*:\n${orderContent}`);
      await sendWA(chatId, "تم التأكيد! طلبك قيد التجهيز. رح يكون جاهز خلال 15 دقيقة أو عند وصولك. نورتنا 🙏");
      delete SESSIONS[chatId]; // إنهاء الجلسة بعد التأكيد
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

/* ================= الوظائف المساعدة ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "text", text: "حلل محتوى الصورة لطلب طعام" }, { type: "image_url", image_url: { url: url } }] }]
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
