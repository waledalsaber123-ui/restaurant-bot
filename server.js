import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= SETTINGS ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= FULL DATA BASE ================= */

const RESTAURANT_INFO = `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ رابط الخريطة: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً.
💰 الدفع: كاش، كليك (0796893403)، زين كاش.
⏱️ وقت التوصيل: من 30 إلى 45 دقيقة.
`;

const MENU_DATA = `
[الوجبات العائلية والصدور - تشمل بطاطا حتماً]
- وجبة شاورما اقتصادية (صدر أبو 6): 6 دنانير (6 سندويشات + بطاطا عائلي).
- وجبة شاورما عائلي (الأوفر - صدر أبو 9): 9 دنانير (8 سندويشات + بطاطا عائلي كبير).
- سناكات اقتصادية (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- سناكات عائلية (10 دنانير): 6 سندويشات + 4 بطاطا + 2 لتر مشروب.
- سناكات عملاقة (14 دينار): 9 سندويشات + 6 بطاطا + 3 لتر مشروب.

[الأصناف الفردية]
- ساندويش ديناميت (زنجر 45 سم): 1 دينار.
- وجبة ديناميت (زنجر 45 سم + بطاطا): 2 دينار.
- صاروخ شاورما 45 سم: 1.5 دينار.
- قنبلة رمضان (برجر 250 غم): 2.25 دينار.
- خابور كباب (45 سم): 2 دينار.
- وجبة فردية (سكالوب/زنجر/برجر): 2 دينار (تشمل بطاطا).
- ساندويش فردي: 1.5 دينار (بدون بطاطا).
- وجبات شاورما: عادي (2)، سوبر (2.75)، دبل (3.25)، تربل (4).
`;

const DELIVERY_ZONES = `
[قائمة رسوم التوصيل - 200 منطقة]
- 1.5: صويلح، اشارة الدوريات، مجدي مول.
- 2: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال.
- 2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، خلدا، ام السماق، المدينة الطبية.
- 3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، البقعة (سعر جديد 3 دنانير).
- 4: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، سحاب، دوار الجمرك.
- 5: عراق الأمير.
`;

const SYSTEM_PROMPT = `
أنت "صابر". ذاكرتك 50 رسالة.
🔴 قوانين إجبارية للبيانات:
1. في حالة "التوصيل": يجب إجبار الزبون على إعطاء (الاسم، الرقم، والمنطقة/العنوان التفصيلي).
2. في حالة "الاستلام من المطعم": يجب إجبار الزبون على إعطاء (الاسم، والرقم) فقط.
3. لا ترسل قالب [KITCHEN_GO] للمطبخ نهائياً إلا إذا كانت هذه البيانات مكتملة والطلب واضحاً.
4. الديناميت هي زنجر 45 سم.
5. وقت التوصيل دائماً من 30 إلى 45 دقيقة.
`;

/* ================= VOICE & WEBHOOK ================= */

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
        { role: "system", content: SYSTEM_PROMPT + "\n" + RESTAURANT_INFO + "\n" + MENU_DATA + "\n" + DELIVERY_ZONES },
        ...session.history.slice(-50),
        { role: "user", content: text }
      ],
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      // فحص ذكي لإجبارية البيانات حسب نوع الطلب
      const isDelivery = session.history.some(h => h.content.includes("توصيل"));
      const hasName = !reply.includes("الاسم: \n");
      const hasPhone = !reply.includes("الرقم: \n");
      const hasAddress = !reply.includes("العنوان: \n");

      if (hasName && hasPhone && (!isDelivery || hasAddress)) {
        await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد مؤكد!*"));
        await sendWA(chatId, "أبشر، طلبك صار بالمطبخ ورح يوصلك خلال 30-45 دقيقة. نورتنا! 🙏");
        delete SESSIONS[chatId];
        return;
      } else {
        reply = "يا غالي، عشان نعتمد الطلب محتاج تأكد لي (الاسم والرقم" + (isDelivery ? " والعنوان" : "") + ") الله يسعدك.";
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
