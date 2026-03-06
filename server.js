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

/* ================= قاعدة البيانات الشاملة (المنيو + المناطق + الموقع) ================= */
const DATA = {
  INFO: `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ رابط الموقع: https://maps.google.com/?q=32.0155,35.8675
⏰ الدوام: 2:00 م - 3:30 فجراً.
⏱️ مدة التوصيل: 30-45 دقيقة.`,

  MENU: `
[1. الوجبات العائلية والصدور - تشمل بطاطا]
- صدر شاورما أبو 6: 6.00 دنانير (6 سندويشات + بطاطا).
- صدر شاورما أبو 9 (الأوفر): 9.00 دنانير (8 سندويشات + بطاطا عائلي كبير).
- سناكات اقتصادية: 7.00 دنانير (4 سندويش: سكالوب/برجر/زنجر + 2 بطاطا + مشروب).
- سناكات عائلية: 10.00 دنانير (6 سندويش + 4 بطاطا + 2 مشروب).
- سناكات عملاقة: 14.00 دينار (9 سندويش + 6 بطاطا + 3 مشروب).

[2. الأصناف الفردية - الساندويش لا يشمل بطاطا / الوجبة تشمل]
- زنجر ديناميت (45 سم): ساندويش 1.00 | وجبة 2.00.
- ساندويش فردي (سكالوب/زنجر/برجر): 1.50 دينار.
- وجبة فردية (سكالوب/زنجر/برجر + بطاطا): 2.00 دينار.
- صاروخ شاورما (45 سم): 1.50 دينار.
- قنبلة رمضان (برجر 250غم): 2.25 دينار.
- خابور كباب (45 سم): 2.00 دينار.
- وجبات الشاورما: عادي 2.00 | سوبر 2.75 | دبل 3.25 | تربل 4.00.`,

  DELIVERY_ZONES: `
[رسوم التوصيل الثابتة - يمنع تغييرها]
- 0.00: في حال (الاستلام من المطعم).
- 1.50: صويلح، الدوريات، مجدي مول.
- 2.00: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال.
- 2.50: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، خلدا، ام السماق، المدينة الطبية.
- 3.00: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، البقعة.
- 4.00: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، سحاب، دوار الجمرك.`
};

const SYSTEM_PROMPT = `
أنت "صابر"، المساعد الذكي لمطعم شاورما. التزم حرفياً بما يلي:
1. **الاستلام**: إذا طلب الزبون "استلام"، السعر 0 والتوصيل يسقط. اطلب (الاسم والرقم) فقط.
2. **التوصيل**: إذا طلب "توصيل"، ابحث عن منطقته في القائمة. طبربور دائماً 3.00 دنانير. اطلب (الاسم، الرقم، العنوان).
3. **الحساب**: اجمع الأصناف بدقة (الوجبة غير الساندويش). اعطِ المجموع النهائي بكلمة "دينار" وليس "تقريباً".
4. **الصور**: إذا أرسل العميل صورة، حللها كطلب أو وصل دفع.
5. **Kitchen Tag**: أرسل [KITCHEN_GO] فقط في الملخص النهائي بعد موافقة العميل.
`;

/* ================= معالجة الطلبات ================= */

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;
  let userContent = [];

  if (!chatId) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };

  // التعامل مع النصوص، الصوت، والصور
  if (body.typeWebhook === "incomingMessageReceived") {
    let text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    userContent.push({ type: "text", text: text });
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    let voiceText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
    userContent.push({ type: "text", text: voiceText });
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userContent.push({ type: "text", text: "ماذا يوجد في هذه الصورة؟ إذا كان طلباً استخرجه." });
  }

  if (userContent.length === 0) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + DATA.INFO + "\n" + DATA.MENU + "\n" + DATA.DELIVERY_ZONES },
        ...SESSIONS[chatId].history.slice(-12),
        { role: "user", content: userContent }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔥 *طلب جديد معتمد*"));
      await sendWA(chatId, "تم! طلبك صار عند المعلم بالمطبخ. نورتنا يا غالي! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    SESSIONS[chatId].history.push({ role: "user", content: "رسالة عميل" }, { role: "assistant", content: reply });
  } catch (err) { console.error("Error"); }
});

/* ================= وظائف مساعدة ================= */

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
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
  } catch (err) { return ""; }
}

app.listen(3000, () => console.log("Saber Bot Full & Vision Ready"));
