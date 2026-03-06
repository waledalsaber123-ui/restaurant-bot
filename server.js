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

const SESSIONS = {};

/* ================= DATA BASE (NEW & DETAILED) ================= */

const RESTAURANT_INFO = `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ الخريطة: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً.
💰 الدفع: كاش، كليك (0796893403)، زين كاش.
`;

const MENU_DATA = `
[العروض القوية - نركز عليها]
- ساندويش ديناميت 45 سم (متوسط الحرارة، للكبار والصغار): 1 دينار.
- صاروخ الشاورما 45 سم: 1.5 دينار.
- قنبلة رمضان (برجر 250 غم، ارتفاع 17 سم): 2.25 دينار.
- خابور كباب (45 سم، 250 غم كباب + خلطة خاصة): 2 دينار.

[الوجبات العائلية (الصدور)]
- وجبة شاورما اقتصادية (صدر أبو 6): 6 دنانير (6 سندويشات/48 قطعة + بطاطا عائلي).
- وجبة شاورما عائلي (الأوفر - صدر أبو 9): 9 دنانير (8 سندويشات/72 قطعة + بطاطا عائلي كبير).

[سناكات عائلية]
- وجبة اقتصادية سناكات (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- وجبة عائلية سناكات (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2 لتر مشروب.
- الوجبة العملاقة سناكات (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3 لتر مشروب.

[الوجبات الفردية (مع بطاطا)]
- سكالوب/زنجر/برجر (150غم): 2 دينار.
- شاورما: عادي 2، سوبر 2.75، دبل 3.25، تربل 4.

[السندويشات (بدون بطاطا)]
- سكالوب/زنجر/برجر (150غم): 1.5 دينار.
- شاورما: عادي 1، سوبر 1.5.
* ملاحظة: لتحويل أي ساندويش أو عرض إلى وجبة، أضف 1 دينار.

[الإضافات]
- بطاطا: فرط 1، عائلي 3، جامبو 6.
- إضافة جبنة: 0.5.
- مشروب: 250مل (0.35)، 1 لتر (0.50).
`;

// ملاحظة: تم اختصار القائمة برمجياً هنا لسهولة القراءة ولكن البوت سيعرف السعر بناءً على المناطق المذكورة
const DELIVERY_ZONES = `
[قائمة التوصيل المختصرة - البوت يحدد السعر بدقة]
1.5: صويلح، اشارة الدوريات، مجدي مول، كلية المجتمع العربي.
1.75: المختار مول، طلوع نيفين.
2: شارع الجامعة، الجبيهة، تلاع العلي، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال، صافوط، دوار الداخلية، مستشفى التخصصي.
2.25: الرابية، دوار خلدا، دوار الكيلو، حي البركة.
2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، السفارة الصينية، ضاحية الرشيد، خلدا.
3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، جبل عمان، البقعة.
3.5: البيادر، طريق المطار، حي نزال، شارع الحرية، المقابلين، الهاشمي.
4: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، طارق المطار، سحاب.
5: عراق الأمير.
`;

const SYSTEM_PROMPT = `
أنت "صابر"، موظف استقبال ذكي في مطعم شاورما.
🔴 وظيفتك الأساسية:
1. الترحيب بالزبون بلهجة أردنية نشمية.
2. "رفع سلة الشراء": إذا طلب العميل وجبة عادية، اقترح عليه "ديناميت" أو "خابور كباب" أو "قنبلة رمضان".
3. تأكد إذا كان الطلب "توصيل" أو "استلام من المطعم".
4. إذا كان "توصيل"، ابحث عن المنطقة في قائمة التوصيل وحدد سعرها بدقة.
5. لا تطلب البيانات الشخصية إلا بعد إنهاء اختيار الأصناف.

🔴 البيانات الإجبارية عند الختام:
عندما يعتمد الزبون الطلب، يجب أن ترسل القالب التالي فقط ليرسل للمطبخ:
[KITCHEN_GO]
الاسم: 
الرقم: 
العنوان (أو استلام من المطعم): 
الصنف: 
السعر (الأكل): 
اجور التوصيل: 
اجمالي الدفع: 
`;

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!chatId || chatId.includes("@g.us") || !text.trim()) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastActive: Date.now() };
  const session = SESSIONS[chatId];

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + RESTAURANT_INFO + "\n" + MENU_DATA + "\n" + DELIVERY_ZONES },
        ...session.history.slice(-15),
        { role: "user", content: text }
      ],
      temperature: 0.7
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد!*"));
      await sendWA(chatId, "أبشر يا نشمي، طلبك اعتمدناه وصار عند الشباب بالمطبخ. صحتين وعافية سلفاً! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error Processing Request"); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) { console.error("WA ERROR"); }
}

app.listen(3000, () => console.log("Saber Bot Master Live"));
