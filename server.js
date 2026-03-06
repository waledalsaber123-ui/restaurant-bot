import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= العدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= قاعدة البيانات الكاملة ================= */

const RESTAURANT_DATA = `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ رابط الموقع: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً | ⏱️ التوصيل: 30-45 دقيقة.
💰 الدفع: كاش، كليك (0796893403)، زين كاش.

[المنيو - الوجبة تشمل بطاطا / الساندويش لا]
1. الوجبات العائلية والصدور (مع بطاطا حتماً):
- صدر شاورما أبو 6: 6 دنانير (6 سندويشات + بطاطا).
- صدر شاورما أبو 9 (الأوفر): 9 دنانير (8 سندويشات + بطاطا عائلي كبير).
- سناكات اقتصادية (7 دنانير): 4 سندويشات (سكالوب، برجر، زنجر) + 2 بطاطا + مشروب.
- سناكات عائلية (10 دنانير): 6 سندويشات + 4 بطاطا + 2 مشروب.
- سناكات عملاقة (14 دينار): 9 سندويشات + 6 بطاطا + 3 مشروب.

2. الأصناف الفردية:
- ديناميت (زنجر 45 سم): 1 دينار ساندويش / 2 دينار وجبة (مع بطاطا).
- ساندويش فردي (سكالوب/زنجر/برجر): 1.5 دينار.
- وجبة فردية (سكالوب/زنجر/برجر + بطاطا): 2 دينار.
- صاروخ شاورما (45 سم): 1.5 دينار.
- قنبلة رمضان (برجر 250غم): 2.25 دينار.
- خابور كباب (45 سم): 2 دينار.
- وجبات شاورما: عادي 2، سوبر 2.75، دبل 3.25، تربل 4.

[رسوم التوصيل لـ 200 منطقة]
- 1.5: صويلح، الدوريات، مجدي مول.
- 2: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال.
- 2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، خلدا، ام السماق، المدينة الطبية.
- 3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، البقعة (جديد).
- 4: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، سحاب، دوار الجمرك.
`;

const SYSTEM_PROMPT = `
أنت "صابر". ذاكرتك حديدية (50 رسالة). 
🔴 نظام إجبار البيانات:
- للتوصيل: اجبر الزبون على (الاسم، الرقم، العنوان التفصيلي).
- للاستلام: اجبر الزبون على (الاسم، الرقم) فقط.
- ممنوع إرسال [KITCHEN_GO] إلا بعد التأكد من البيانات والحصول على كلمة "تم" أو "أكد" من الزبون.
- الديناميت هي زنجر 45 سم.
- وقت التوصيل 30-45 دقيقة.
`;

/* ================= معالجة الصوت والرسائل ================= */

async function transcribeVoice(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const filePath = path.join("/tmp", `voice_${Date.now()}.ogg`);
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
        { role: "system", content: SYSTEM_PROMPT + "\n" + RESTAURANT_DATA },
        ...session.history.slice(-50),
        { role: "user", content: text }
      ],
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    // التأكد من اكتمال البيانات قبل الإرسال للمطبخ
    if (reply.includes("[KITCHEN_GO]")) {
      const isMissing = reply.includes("الاسم: \n") || reply.includes("الرقم: \n");
      if (!isMissing) {
        await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد مؤكد!*"));
        await sendWA(chatId, "تم اعتماد طلبك يا غالي، المطبخ استلم التفاصيل. رح يوصلك خلال 30-45 دقيقة. نورتنا! 🙏");
        delete SESSIONS[chatId];
        return;
      } else {
        reply = "يا غالي، عشان أثبت الطلب وما يروح ناقص للمطبخ، محتاج منك تأكد لي (الاسم، الرقم، والعنوان) الله يسعدك.";
      }
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot Master Live"));
