import express from "express";
import axios from "axios";

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

/* ================= SESSION MEMORY ================= */
const SESSIONS = {};

/* ================= DATA BASE ================= */

const RESTAURANT_INFO = `
اسم المطعم: صابر جو سناك (Saber Jo Snack)
العنوان: عمان - شارع الجامعة الأردنية - طلوع هافانا
موقع قوقل ماب: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9
أوقات الدوام: من 2:00 ظهراً حتى 3:30 فجراً
طرق الدفع: كاش أو كليك (CliQ: 0796893403) أو زين كاش.
الخدمة: توصيل أو استلام من المطعم فقط (لا يوجد صالة طعام).
`;

const MENU_DATA = `
[قسم العروض] (اعرضها فوراً عند السؤال عن العروض)
- ساندويش ديناميت 45 سم: 1 دينار 
- صاروخ الشاورما 45 سم: 1.5 دينار
- قنبلة رمضان (برجر 250 جرام): 2.25 دينار
- خابور كباب (ساندويش 45 سم - كباب 250 غم): 2 دينار

[قسم الوجبات العائلية]
- الوجبة الاقتصادية سناكات: 7 دنانير
- الوجبة العائلية سناكات: 10 دنانير
- الوجبة العملاقة سناكات: 14 دينار
- وجبة الشاورما الاقتصادية (صدر شاورما أبو 6): 6 دنانير
- وجبة الشاورما العائلي الأوفر (صدر شاورما أبو 9): 9 دنانير

[قسم الوجبات الفردية والسندويشات]
- وجبة سكالوب/زنجر/برجر 150غم: 2 دينار (الساندويش وحده بـ 1.5)
- وجبة شاورما (عادي: 2، سوبر: 2.75، دبل: 3.25، تربل: 4)
- ساندويش شاورما (عادي: 1، سوبر: 1.5)
*ملاحظة: لتحويل أي عرض أو ساندويش لوجبة أضف 1 دينار*

[الإضافات]
- بطاطا (عادي: 1، عائلي: 3، جامبو: 6) | جبنة: 0.5 | مشروب (صغير: 0.35، لتر: 0.50)
`;

const DELIVERY_DATA = `
- 1.5 دينار: صويلح، الدوريات، مجدي مول.
- 1.75 دينار: المختار مول، طلوع نيفين.
- 2 دينار: شارع الجامعة، ضاحية الرشيد، الجبيهة، تلاع العلي، المدينة الرياضية، جبل الحسين، مكة مول، خلدا.
- 2.5 دينار: الرابية، الجاردنز، الشميساني، دابوق، أبو نصير، العبدلي.
- 3 دينار: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد.
- 4 دينار: وادي السير، مرج الحمام، القويسمة، ماركا، أبو علندا.
- 5 دينار: عراق الأمير.
(أي منطقة غير مذكورة يتم تحديدها حسب المسافة أو نعتذر عن التوصيل).
`;

const SYSTEM_PROMPT = `
أنت مساعد ذكي لمطعم صابر جو سناك. 

قواعد الرد:
1. الرد حصراً بالعامية الأردنية اللطيفة.
2. إذا سأل عن "العروض"، أرسل قائمة العروض فوراً.
3. التوصيل: إذا طلب توصيل، يجب أخذ (الاسم، رقم الهاتف، الموقع بالتفصيل أو لينك اللوكيشن).
4. الاستلام: إذا طلب استلام من المطعم، يجب أخذ (الاسم ورقم الهاتف) وإعطاؤه عنوان المطعم ورابط الخريطة.
5. الحساب: احسب المجموع بدقة (الطلب + رسوم التوصيل).
6. الدوام: إذا سأل، نحن نفتح من 2 ظهراً لـ 3:30 فجراً.

ممنوع إنهاء الطلب وإرساله للمطبخ إلا إذا توفرت المعلومات التالية:
- الطلب بالتفصيل.
- المجموع النهائي.
- الاسم والرقم.
- العنوان (أو كلمة "استلام من المطعم").

عند التأكيد النهائي، ابدأ رسالتك بـ [KITCHEN_GO].

المعلومات المرجعية:
${RESTAURANT_INFO}
المنيو: ${MENU_DATA}
التوصيل: ${DELIVERY_DATA}
`;

/* ================= HELPERS ================= */
async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) { console.error("WA ERROR:", err.message); }
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  // منع الرد على الجروبات ومنع الرد على الرسائل الفارغة
  if (!chatId || chatId.includes("@g.us") || !text.trim()) return;

  if (!SESSIONS[chatId]) {
      SESSIONS[chatId] = { history: [], lastActive: Date.now() };
  }

  if (text.includes("طلب جديد")) {
      SESSIONS[chatId] = { history: [], lastActive: Date.now() };
      await sendWA(chatId, "من عيوني، مسحنا كل شي. تفضل شو حابب تطلب هسه؟ 🍔");
      return;
  }

  const session = SESSIONS[chatId];
  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history.slice(-10),
        { role: "user", content: text }
      ],
      temperature: 0.3
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` },
      timeout: 15000
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const orderClean = reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد!*").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, orderClean);
      await sendWA(chatId, "تم اعتماد طلبك وإرساله للمطبخ! 👨‍🍳\nثواني وبنكلمك لتأكيد التجهيز. صحتين وعافية!");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (err) {
    await sendWA(chatId, "حصل ضغط بسيط عندي، ممكن ترسل آخر رسالة كمان مرة؟ 🙏");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Saber Jo Bot Active on ${PORT}`));
