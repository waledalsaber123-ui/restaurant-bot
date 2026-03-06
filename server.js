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

const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال مطعم شاورما. ردودك قصيرة، أردنية، وذكية جداً.

⏰ **الدوام**: من 2 ظهراً لـ 4 فجراً.
📅 **نظام الحجز**: متاح لدينا حجز الطلبات مسبقاً وتحديد موعد لاحق للتوصيل أو الاستلام.

🍔 **المنيو**:
${SETTINGS.DYNAMIC_MENU}

🚚 **التوصيل**:
${SETTINGS.DYNAMIC_DELIVERY}

⚠️ **تعليمات الحجز والطلبات**:
1. **قبول الحجز**: إذا طلب العميل حجزاً أو تحديد موعد توصيل، وافق فوراً واسأله عن (الوقت المطلوب).
2. **تفاصيل الحجز**: يجب أن يتضمن الملخص النهائي: (الأصناف، المجموع، موعد التوصيل/الحجز، الاسم، الرقم، العنوان).
3. **الصور**: حلل أي صورة عرض يرسلها العميل ولا تنكر وجودها.
4. **الدقة**: طبربور دائماً 3 دنانير.
5. **الملخص**: أرسل [KITCHEN_GO] فقط عند التأكيد النهائي، وتأكد من كتابة "موعد الحجز: [الوقت]" بوضوح.
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

  // معالجة الصور
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userContent.push({ type: "text", text: "حلل الصورة للطلب أو العرض." });
  } 
  // معالجة الفويس والنص
  else {
    const text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    if (text) userContent.push({ type: "text", text: text });
  }

  if (userContent.length === 0) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-40),
        { role: "user", content: userContent }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      // إرسال تفاصيل الحجز كاملة للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "📅 *حجز/طلب جديد مؤكد*"));
      await sendWA(chatId, "تم تثبيت حجزك وطلبك يا غالي. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: "طلب/استفسار عميل" }, { role: "assistant", content: reply });
  } catch (err) { console.error("Saber Error"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Booking System Online"));
