import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= الإعدادات الحساسة ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= قاعدة بيانات المطعم الصارمة ================= */
const DATA = {
  INFO: `📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
⏰ الدوام: 2:00 م - 3:30 فجراً.
⏱️ مدة التوصيل الثابتة: 30-45 دقيقة.`,
  
  MENU: `
[أسعار الأصناف - نهائية]
- ساندويش فردي (سكالوب/زنجر/برجر): 1.50 دينار.
- وجبة فردية (ساندويش + بطاطا): 2.00 دينار.
- زنجر ديناميت (45 سم): ساندويش 1.00 دينار | وجبة 2.00 دينار.
- صاروخ شاورما (45 سم): 1.50 دينار.
- خابور كباب (45 سم): 2.00 دينار.
- وجبات الشاورما: عادي 2.00 | سوبر 2.75 | دبل 3.25 | تربل 4.00.
- الصدور العائلية: أبو 6 (6 دنانير) | أبو 9 (9 دنانير).
- سناكات اقتصادية: 4 سندويش + 2 بطاطا + مشروب = 7.00 دنانير.
- سناكات عائلية: 6 سندويش + 4 بطاطا + 2 مشروب = 10.00 دنانير.
- سناكات عملاقة: 9 سندويش + 6 بطاطا + 3 مشروب = 14.00 دينار.`,

  DELIVERY: `
[رسوم التوصيل الثابتة - يمنع التغيير]
- 1.50: صويلح، الدوريات، مجدي مول.
- 2.00: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال.
- 2.50: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، خلدا، ام السماق، المدينة الطبية.
- 3.00: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، البقعة.
- 4.00: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، سحاب، دوار الجمرك.`
};

const SYSTEM_PROMPT = `
أنت "صابر"، نظام استقبال حجوزات احترافي. التزم بالقوانين التالية حرفياً:
1. **ممنوع كلمة "تقريباً"**: الأسعار نهائية كما هي في المنيو.
2. **تسلسل الرد**:
   أ- حصر الطلب (تمييز الساندويش عن الوجبة).
   ب- حساب المجموع الفرعي للأصناف.
   ج- سؤال الزبون عن المنطقة لتحديد رسوم التوصيل من القائمة.
   د- إعطاء المجموع الكلي النهائي.
   هـ- طلب (الاسم، الرقم، العنوان) في رسالة واحدة فقط بعد موافقة العميل على السعر.
3. **التوصيل لـ طبربور**: السعر ثابت وهو 3.00 دنانير دائماً.
4. **البيانات الشخصية**: إذا أعطاك العميل اسمه ومنطقته، لا تكرر طلب "العنوان التفصيلي" بشكل مزعج، فقط أكد الطلب.
5. **Kitchen Tag**: لا تضع [KITCHEN_GO] إلا في الملخص النهائي المؤكد الذي يحتوي على كل البيانات.
`;

/* ================= المعالجة والذكاء الاصطناعي ================= */

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let text = "";
  let chatId = body.senderData?.chatId;

  if (body.typeWebhook === "incomingMessageReceived") {
    text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    text = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  }

  if (!chatId || !text.trim()) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + DATA.INFO + "\n" + DATA.MENU + "\n" + DATA.DELIVERY },
        ...session.history.slice(-15), // ذاكرة أقصر لتركيز أعلى
        { role: "user", content: text }
      ],
      temperature: 0 // لضمان عدم التأليف والالتزام بالأرقام
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
        const cleanMsg = reply.replace("[KITCHEN_GO]", "✅ *طلب جديد مؤكد*").trim();
        await sendWA(SETTINGS.KITCHEN_GROUP, cleanMsg);
        await sendWA(chatId, "أبشر يا غالي، تم اعتماد طلبك وارساله للمطبخ. نورتنا! 🙏");
        delete SESSIONS[chatId];
        return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
  } catch (err) { console.error("AI Error"); }
});

/* ================= الوظائف المساعدة ================= */

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

async function transcribeVoice(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const filePath = path.join("/tmp", `v_${Date.now()}.ogg`);
    fs.writeFileSync(filePath, buffer);
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "whisper-1");
    const whisper = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });
    fs.unlinkSync(filePath);
    return whisper.data.text;
  } catch (err) { return ""; }
}

app.listen(3000, () => console.log("Professional Saber Bot Online"));
