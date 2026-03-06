import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

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

const DATA = {
  INFO: `📍 عمان - طلوع هافانا. 🗺️ https://maps.google.com/?q=32.0155,35.8675`,
  MENU: `[المنيو]من البرونت.`,
  DELIVERY: `[التوصيل]من البرونت و التزم  في الاسعار .`
};

const SYSTEM_PROMPT = `
أنت "صابر". ردودك (قصيرة جداً، باللهجة الأردنية، ومباشرة).
قوانين صارمة:
- لا ترحب بالعميل مجدداً إذا كان يطلب (ادخل في الموضوع فوراً).
- إذا استلمت صوتاً، اعتبره نصاً وأجب عليه بسرعة.
- طبربور دائماً 3 دنانير توصيل.
- اطلب البيانات (اسم، رقم، عنوان) فقط بعد حساب السعر النهائي.
- ممنوع كتابة أكثر من جملتين في الرد الواحد.
`;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;
  if (!chatId) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let incomingText = "";

  // 1. معالجة الرسالة الصوتية فوراً وتحويلها لنص
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    incomingText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  } 
  // 2. معالجة النص
  else if (body.typeWebhook === "incomingMessageReceived") {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  }
  // 3. معالجة الصور
  else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    incomingText = "[صورة من العميل - حللها بناءً على المنيو]";
  }

  if (!incomingText) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + DATA.INFO + "\n" + DATA.MENU + "\n" + DATA.DELIVERY },
        ...session.history.slice(-20),
        { role: "user", content: incomingText }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "✅ *طلب جديد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: incomingText }, { role: "assistant", content: reply });
  } catch (err) { console.error("AI Error"); }
});

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
    return res.data.text; // إرجاع النص المستخرج من الصوت
  } catch (err) { return "العميل أرسل صوتاً لم أفهمه"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Fast & Voice Optimized"));
