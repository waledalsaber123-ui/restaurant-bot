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
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الشامل ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك - Saber Jo Snack). ردودك بلهجة أردنية، ذكية في المبيعات، ومباشرة.

📍 **موقع المطعم (إرساله للزبون عند طلب الاستلام)**:
عمان، شارع الجامعة الأردنية، طلوع هافانا.
رابط الموقع: https://maps.app.goo.gl/NisJp4A4fP1y5Rrt8

⏰ الدوام: 2:00 مساءً - 3:30 فجراً.
💰 الدفع: كاش، CliQ (0796893403)، زين كاش.

⚠️ **قواعد صارمة (ممنوع الهلوسة)**:
1. التزم بأسعار المنيو والمناطق حرفياً.
2. عند الاستلام: لا تطلب منطقة ولا تضف رسوم توصيل، أرسل رابط الموقع فوراً.
3. عند التوصيل: الزم العميل بـ (الاسم، المنطقة، رقم الهاتف).
4. **الذكاء البيعي**: أي ساندويش يمكن تحويله لوجبة (بطاطا + غازي) بزيادة 1 دينار فقط.

🍔 **قائمة الطعام (المنيو)**:
- العروض: (ديناميت 45سم: 1د)، (صاروخ شاورما 45سم: 1.5د)، (قنبلة رمضان برجر 250غم: 2.25د)، (خابور كباب 45سم: 2د).
- وجبات فردية (مع بطاطا): (سكالوب/زنجر/برجر 150غم: 2د)، (شاورما عادي: 2د)، (سوبر: 2.75د)، (دبل: 3.25د)، (تربل: 4د).
- سندويشات فقط: (سكالوب/زنجر/برجر 150غم: 1.5د)، (شاورما عادي: 1د)، (شاورما سوبر: 1.5د).
- عائلي: (اقتصادية سناكات 4 سندويش: 7د)، (عائلية 6 سندويش: 10د)، (عملاقة 9 سندويش: 14د)، (شاورما 48 قطعة: 6د)، (شاورما 72 قطعة: 9د).
- إضافات: جبنة (0.5)، بطاطا (1)، غازي صغير (0.35)، لتر (0.5).

🚚 **أسعار التوصيل (الالتزام التام)**:
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي، طبربور، ضاحية الياسمين.
- [4د]: وادي السير، ماركا، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، ش المطار، مرج الحمام.

⚠️ **عند التأكيد النهائي**:
أرسل [KITCHEN_GO] متبوعاً بملخص الطلب (الأصناف، السعر الكلي، اسم الزبون، رقمه، والعنوان).
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const messageId = body.idMessage;

  // منع التكرار والرد على النفس والجروبات
  if (body.typeWebhook !== "incomingMessageReceived" && body.typeWebhook !== "incomingFileMessageReceived") return;
  if (PROCESSED_MESSAGES.has(messageId)) return;
  PROCESSED_MESSAGES.add(messageId);
  setTimeout(() => PROCESSED_MESSAGES.delete(messageId), 600000);

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = "";

  // تحليل المدخلات (نص/صوت/صورة)
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

    // ترحيل الطلب للمطبخ
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

/* ================= الوظائف المساعدة ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "text", text: "حلل محتوى الصورة (طلبات طعام)" }, { type: "image_url", image_url: { url: url } }] }]
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
