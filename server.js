import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= إعدادات النظام (Environment Variables) ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
  // سحب المنيو والتوصيل من البيئة حصراً كما طلبت
  DYNAMIC_MENU: process.env.RESTAURANT_MENU, 
  DYNAMIC_DELIVERY: process.env.DELIVERY_PRICES
};

const SESSIONS = {};

/* ================= نظام البرومبت (التعليمات والدوام) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال مطعم شاورما. ردودك قصيرة (سطرين بالكتير)، أردنية، ومباشرة جداً.

⏰ **أوقات الدوام الرسمي**: 
من الساعة 2:00 ظهراً حتى الساعة 4:00 فجراً يومياً.

📍 **الموقع**: عمان - شارع الجامعة - طلوع هافانا. (https://maps.google.com/?q=32.0155,35.8675)

📋 **قائمة الطعام (المنيو)**:
${SETTINGS.DYNAMIC_MENU}

🚚 **رسوم التوصيل**:
${SETTINGS.DYNAMIC_DELIVERY}

⚠️ **تعليمات صارمة (ممنوع تجاوزها)**:
1. **الخصوصية**: لا ترد على أي رسالة داخل الجروبات. رد فقط على المحادثات الخاصة.
2. **الذاكرة**: تذكر الأصناف اللي طلبها العميل. إذا حكى "بدي قنبلة" أو "خابور كباب" لا ترجع تسأله شو طلبك.
3. **الدقة**: ممنوع الغلط بأسعار التوصيل (طبربور دائماً 3د). لا تستخدم كلمات مثل "تقريباً".
4. **التسلسل**: احسب المجموع النهائي (أصناف + توصيل) أولاً، ثم اطلب (الاسم والرقم والعنوان).
5. **الفويس**: إذا وصلك صوت، حوله لنص وتفاعل معه كطلب رسمي.
6. **الاعتماد**: أرسل [KITCHEN_GO] فقط لما العميل يثبت طلبه نهائياً.
`;
};

/* ================= معالجة الرسائل ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;

  // منع الرد في الجروبات نهائياً
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let incomingText = "";

  // 1. معالجة الصوت (Whisper)
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    incomingText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  } 
  // 2. معالجة النصوص
  else if (body.typeWebhook === "incomingMessageReceived") {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  }
  // 3. معالجة الصور (Vision)
  else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    incomingText = "[العميل أرسل صورة، حللها كطلب بناءً على المنيو]";
  }

  if (!incomingText.trim()) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-40), // ذاكرة لآخر 40 رسالة لضمان عدم النسيان
        { role: "user", content: incomingText }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد مؤكد*"));
      await sendWA(chatId, "تم يا غالي، طلبك صار بالمطبخ ورح يوصلك بأسرع وقت. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: incomingText }, { role: "assistant", content: reply });
  } catch (err) { console.error("AI Error"); }
});

/* ================= الوظائف المساعدة ================= */
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
  } catch (err) { return "صوت"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot 4:00 AM Version Live"));
