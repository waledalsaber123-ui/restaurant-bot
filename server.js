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

const SYSTEM_PROMPT = `
أنت "صابر"، موظف استقبال في مطعم شاورما بعمان. ردودك قصيرة جداً (سطرين بالكتير) وباللهجة الأردنية.

📍 **معلومات المطعم والموقع**:
عمان - شارع الجامعة - طلوع هافانا. الموقع: https://maps.google.com/?q=32.0155,35.8675

📋 **المنيو الرسمية (ممنوع تغيير الأسعار)**:
- صدور عائلية: أبو 6 (6 سندويش + بطاطا) بـ 6 دنانير | أبو 9 (8 سندويش + بطاطا) بـ 9 دنانير.
- سناكات: اقتصادية (4 سندويش + بطاطا + بيبسي) بـ 7 دنانير | عائلية بـ 10 دنانير | عملاقة بـ 14 دينار.
- فردي: ساندويش (1.50) | وجبة مع بطاطا (2.00).
- زنجر ديناميت (45 سم): ساندويش (1.00) | وجبة (2.00).
- صاروخ شاورما: 1.50 | خابور كباب: 2.00 | قنبلة رمضان: 2.25.
- وجبات شاورما: عادي 2 | سوبر 2.75 | دبل 3.25 | تربل 4.

🚚 **أسعار التوصيل الثابتة (ممنوع التأليف)**:
- استلام من المطعم: 0 دينار.
- 1.50: صويلح، الدوريات، مجدي مول.
- 2.00: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين.
- 2.50: خلدا، دابوق، أبو نصير، الجاردنز، الشميساني.
- 3.00: طبربور (دائماً 3د)، عبدون، الصويفية، شفا بدران، وسط البلد.
- 4.00: سحاب، ماركا، وادي السير، القويسمة، أبو علندا.

⚠️ **قوانين الذاكرة والتعامل**:
1. تذكر شو طلب العميل بالأول ولا تسأله "شو بدك تطلب" إذا حكى الصنف.
2. إذا العميل حكى "استلام"، احذف رسوم التوصيل فوراً.
3. افهم الفويس وحوله لطلب نصي.
4. اطلب الاسم والرقم والعنوان بآخر المحادثة بعد ما تعطي السعر النهائي.
5. لا ترسل [KITCHEN_GO] إلا لما العميل يحكي "تم" أو "أكد".
`;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;
  if (!chatId) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let incomingText = "";

  // فهم الفويس
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    incomingText = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
  } 
  // معالجة النصوص
  else if (body.typeWebhook === "incomingMessageReceived") {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
  }
  // تحليل الصور
  else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    incomingText = "[العميل بعت صورة، حللها كأنها طلب]";
  }

  if (!incomingText) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history.slice(-40), // ذاكرة قوية لـ 40 رسالة
        { role: "user", content: incomingText }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد مؤكد*"));
      await sendWA(chatId, "تم يا غالي، الطلب صار بالمطبخ ورح يوصلك بأسرع وقت. نورتنا! 🙏");
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
    return res.data.text;
  } catch (err) { return "صوت من العميل"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Final Version Online"));
