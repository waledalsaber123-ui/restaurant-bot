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
أنت "صابر"، مساعد مطعم شاورما ذكي ومحترف. ردودك قصيرة، أردنية، ومباشرة.

⏰ **الدوام**: يومياً من 2 ظهراً لـ 4 فجراً.
📍 **الموقع**: عمان، شارع الجامعة، طلوع هافانا.

🍔 **المنيو والأسعار**:
${SETTINGS.DYNAMIC_MENU}

🚚 **التوصيل**:
${SETTINGS.DYNAMIC_DELIVERY}

⚠️ **قواعد العمل (الحل النهائي)**:
1. **الصور والعروض**: إذا أرسل العميل صورة، حللها فوراً. لا تقل "لا يوجد عروض" إذا كانت الصورة تحتوي على عرض.
2. **الخصوصية**: ممنوع الرد نهائياً في الجروبات.
3. **الذاكرة**: تذكر طلب العميل (مثلاً القنبلة أو الخابور) ولا ترجع تسأل "شو طلبك".
4. **الدقة**: احسب المجموع (أصناف + توصيل) بدقة. طبربور 3 دنانير دائماً.
5. **البيانات**: لا تطلب الاسم والرقم إلا في نهاية الطلب وبعد حساب السعر.
6. **التأكيد**: أرسل [KITCHEN_GO] فقط عند كتابة العميل "تم" أو "أكد".
`;
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;

  // منع الرد في الجروبات
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userContent = [];

  // 1. معالجة الصور (رؤية العروض)
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userContent.push({ type: "text", text: "حلل هذه الصورة جيداً. إذا كانت عرضاً، تفاعل معه بناءً على محتواه." });
    userContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
  } 
  // 2. معالجة الفويس (سمع الطلب)
  else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    const transcript = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
    userContent.push({ type: "text", text: transcript });
  }
  // 3. معالجة النصوص
  else if (body.typeWebhook === "incomingMessageReceived") {
    const text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    userContent.push({ type: "text", text: text });
  }

  if (userContent.length === 0) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o", // موديل يدعم الرؤية والتحليل العميق
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-40),
        { role: "user", content: userContent }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔥 *طلب معتمد جديد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    
    // حفظ النص فقط لتوفير الذاكرة
    let logText = userContent.find(c => c.type === "text")?.text || "[وسائط]";
    session.history.push({ role: "user", content: logText }, { role: "assistant", content: reply });
  } catch (err) { console.error("Error in Saber Engine"); }
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

app.listen(3000, () => console.log("Saber Bot - Master AI Live"));
