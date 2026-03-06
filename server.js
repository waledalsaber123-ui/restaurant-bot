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
  KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
  DYNAMIC_MENU: process.env.RESTAURANT_MENU, 
  DYNAMIC_DELIVERY: process.env.DELIVERY_PRICES
};

const SESSIONS = {};

// دالة لجلب الوقت في الأردن لمنع تخبط المواعيد
const getJordanTime = () => {
  return new Intl.DateTimeFormat('ar-JO', {
    timeZone: 'Asia/Amman',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date());
};

const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال مطعم شاورما. ردودك قصيرة، أردنية، وذكية جداً.
الوقت الحالي في الأردن: ${getJordanTime()}

⏰ **الدوام**: من 2 ظهراً لـ 4 فجراً.
📅 **نظام الحجز**: مسموح حجز طلبات لموعد لاحق (اليوم أو غداً).

🍔 **المنيو المعتمد**:
${SETTINGS.DYNAMIC_MENU}

🚚 **التوصيل**:
${SETTINGS.DYNAMIC_DELIVERY}

⚠️ **قواعد منع الهلوسة**:
1. **الذاكرة**: تذكر الأصناف التي طلبها العميل (مثل القنبلة أو الخابور). إذا حدد الطلب، لا تسأله "شو طلبك".
2. **الترحيب**: لا ترحب بالعميل (أهلين، كيف بقدر أساعدك) إذا كنت في منتصف محادثة طلب.
3. **الحجز**: إذا طلب العميل موعداً مستقبلياً، ثبته فوراً في الملخص.
4. **الدقة**: التوصيل لطبربور 3 دنانير دائماً.
5. **الصور**: حلل الصورة فوراً ولا تنكر وجود العروض إذا كانت الصورة تحتوي على عرض.
6. **التأكيد**: أرسل [KITCHEN_GO] فقط عند التأكيد النهائي شامل الموعد والبيانات.
`;
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;

  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userContent = [];
  let logText = "";

  // 1. معالجة الصور
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userContent.push({ type: "text", text: "حلل الصورة للطلب أو العرض بناءً على المنيو." });
    logText = "[صورة]";
  } 
  // 2. معالجة النصوص والفويس
  else {
    const text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    if (text) {
      userContent.push({ type: "text", text: text });
      logText = text;
    }
  }

  if (userContent.length === 0) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-30), // استرجاع آخر 30 رسالة بدقة
        { role: "user", content: userContent }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب/حجز مؤكد*"));
      await sendWA(chatId, "أبشر يا غالي، تم تثبيت الطلب والموعد بنجاح! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    
    // حفظ المحادثة الفعلية لمنع النسيان (الحل الجذري للهلوسة)
    session.history.push({ role: "user", content: logText });
    session.history.push({ role: "assistant", content: reply });
    
  } catch (err) { console.error("Saber AI Error"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Anti-Hallucination Version"));
