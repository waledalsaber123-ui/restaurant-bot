import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= الإعدادات من Environment Variables ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
  // سحب المنيو والتوصيل من البيئة
  DYNAMIC_MENU: process.env.RESTAURANT_MENU, 
  DYNAMIC_DELIVERY: process.env.DELIVERY_PRICES
};

const SESSIONS = {};

/* ================= بناء نظام البرومبت الديناميكي ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال لمطعم شاورما. ردودك قصيرة، أردنية، ومباشرة.
📍 الموقع: عمان، شارع الجامعة، طلوع هافانا.

🍔 **قائمة الطعام المعتمدة**:
${SETTINGS.DYNAMIC_MENU}

🚚 **رسوم التوصيل المعتمدة**:
${SETTINGS.DYNAMIC_DELIVERY}

⚠️ **تعليمات صارمة**:
1. لا ترد على الجروبات نهائياً.
2. تذكر طلبات العميل السابقة ولا تكرر الأسئلة.
3. اطلب الاسم والرقم فقط عند نهاية الطلب.
4. استخدم الأسعار المذكورة أعلاه بدقة ولا تعطِ أسعاراً "تقريبية".
5. أرسل [KITCHEN_GO] فقط عند التأكيد النهائي.
`;
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;

  // منع الرد في المجموعات
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let incomingText = "";

  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    incomingText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  } else if (body.typeWebhook === "incomingMessageReceived") {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    incomingText = "[العميل أرسل صورة، حللها كطلب بناءً على المنيو]";
  }

  if (!incomingText.trim()) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-30),
        { role: "user", content: incomingText }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد مؤكد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: incomingText }, { role: "assistant", content: reply });
  } catch (err) { console.error("Error Processing Request"); }
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
  } catch (err) { return "رسالة صوتية"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Env Variable Menu Version Live"));
