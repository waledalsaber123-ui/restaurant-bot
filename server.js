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

// كل المعلومات الأساسية أصبحت داخل النظام لضمان عدم الخطأ أو النسيان
const SYSTEM_PROMPT = `
أنت "صابر"، مساعد مطعم شاورما محترف. ردودك قصيرة، باللهجة الأردنية، وصارمة في الأسعار.

📍 **موقعنا**: عمان - شارع الجامعة - طلوع هافانا. 🗺️ الرابط: https://maps.google.com/?q=32.0155,35.8675

🍔 **المنيو الرسمية والأسعار (نهائية)**:
- صدور عائلية: أبو 6 (6 دنانير) | أبو 9 (9 دنانير).
- سناكات: اقتصادية (7د) | عائلية (10د) | عملاقة (14د).
- أصناف فردية: ساندويش (1.50) | وجبة (2.00).
- زنجر ديناميت (45 سم): ساندويش (1.00) | وجبة (2.00).
- صاروخ شاورما: 1.50 | خابور كباب: 2.00 | قنبلة رمضان (برجر 250غم): 2.25.
- وجبات الشاورما: عادي (2) | سوبر (2.75) | دبل (3.25) | تربل (4).

🚚 **قائمة التوصيل الثابتة (ممنوع التغيير)**:
- استلام من المطعم: 0.00 دينار.
- 1.50: صويلح، الدوريات، مجدي مول.
- 2.00: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين.
- 2.50: خلدا، دابوق، أبو نصير، الجاردنز، الشميساني.
- 3.00: طبربور (دائماً 3 دنانير)، عبدون، الصويفية، شفا بدران، وسط البلد.
- 4.00: سحاب، ماركا، وادي السير، القويسمة، أبو علندا.

⚠️ **تعليمات الذاكرة والتعامل**:
1. ابدأ بحصر الطلب وحساب سعره فوراً قبل طلب أي بيانات شخصية.
2. ميز بين "سندويش" و "وجبة" (الوجبة دائماً معها بطاطا).
3. بعد السعر، اسأل (توصيل ولا استلام؟). إذا توصيل، حدد السعر من القائمة أعلاه.
4. اطلب (الاسم، الرقم، العنوان) في رسالة واحدة فقط في نهاية المحادثة.
5. لا تنسى الطلبات السابقة في المحادثة، ولا تكرر الترحيب إذا بدأ العميل طلبه.
6. لا ترسل [KITCHEN_GO] إلا بعد كلمة "تم" أو "أكد" من العميل.
`;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;
  if (!chatId) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let incomingText = "";

  // فهم الصوت (فويس)
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    incomingText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  } 
  // فهم النصوص
  else if (body.typeWebhook === "incomingMessageReceived") {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  }
  // فهم الصور
  else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    incomingText = "[العميل أرسل صورة، حللها كطلب أو استفسار]";
  }

  if (!incomingText) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history.slice(-40), // ذاكرة عميقة لـ 40 رسالة لضمان عدم النسيان
        { role: "user", content: incomingText }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔥 *طلب معتمد جديد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ ورح يوصلك بأسرع وقت. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: incomingText }, { role: "assistant", content: reply });
  } catch (err) { console.error("Error in AI chain"); }
});

async function transcribeVoice(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const filePath = path.join("/tmp", `voice_${Date.now()}.ogg`);
    fs.writeFileSync(filePath, Buffer.from(response.data));
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "whisper-1");
    const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });
    fs.unlinkSync(filePath);
    return res.data.text;
  } catch (err) { return "صوت لم أفهمه"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Master Version Ready"));
