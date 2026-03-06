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

/* ================= DETAILED DATA BASE ================= */

const RESTAURANT_INFO = `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ الخريطة: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً.
💰 الدفع: كاش، كليك (0796893403)، زين كاش.
`;

const MENU_DATA = `
[عروض الوجبات العائلية والصدور - البطاطا مشمولة إجبارياً]
- وجبة شاورما اقتصادية (صدر أبو 6): 6 دنانير (6 سندويشات/48 قطعة + بطاطا عائلي).
- وجبة شاورما عائلي (الأوفر - صدر أبو 9): 9 دنانير (8 سندويشات/72 قطعة + بطاطا عائلي كبير).
- وجبة اقتصادية سناكات (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- وجبة عائلية سناكات (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2 لتر مشروب.
- الوجبة العملاقة سناكات (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3 لتر مشروب.

[العروض الفردية المميزة]
- ساندويش ديناميت 45 سم: 1 دينار (لتحويلها وجبة مع بطاطا أضف 1 دينار).
- صاروخ الشاورما 45 سم: 1.5 دينار (لتحويلها وجبة مع بطاطا أضف 1 دينار).
- قنبلة رمضان (برجر 250 غم): 2.25 دينار.
- خابور كباب (45 سم، 250 غم كباب): 2 دينار.

[الوجبات الفردية - تشمل بطاطا]
- وجبة سكالوب/زنجر/برجر: 2 دينار.
- وجبة شاورما: عادي 2، سوبر 2.75، دبل 3.25، تربل 4.

[السندويشات - بدون بطاطا]
- سكالوب/زنجر/برجر: 1.5 دينار.
- ساندويش شاورما: عادي 1، سوبر 1.5.
`;

const DELIVERY_ZONES = `
[أسعار التوصيل]
1.5: صويلح، اشارة الدوريات، مجدي مول، كلية المجتمع العربي.
1.75: المختار مول، طلوع نيفين.
2: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين.
2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال.
3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور.
3.5: البيادر، طريق المطار، حي نزال، شارع الحرية، المقابلين.
4: جبل النصر، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة.
5: عراق الأمير.
`;

const SYSTEM_PROMPT = `
أنت "صابر"، موظف استقبال ذكي. 
🔴 تحذير صارم: لا تقل أبداً أن الوجبات العائلية أو الصدور بدون بطاطا. الوجبات العائلية (أبو 6، أبو 9، وسناكات 7 و10 و14) تأتي مع بطاطا بشكل أساسي ومجاني ضمن السعر.
🔴 مهمتك: 
1. تأكد إذا كان الطلب (توصيل) أو (استلام).
2. إذا كان توصيل، اسأل عن المنطقة وحدد سعرها من القائمة بدقة.
3. شجع الزبون على تجربة (الديناميت أو خابور الكباب أو قنبلة رمضان) لرفع قيمة الطلب.
4. لا تطلب البيانات الشخصية إلا في نهاية المحادثة.

عند الاعتماد النهائي، استخدم هذا القالب فقط:
[KITCHEN_GO]
الاسم: 
الرقم: 
العنوان (أو استلام): 
الصنف: 
السعر: 
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
        ...session.history.slice(-10),
        { role: "user", content: text }
      ],
      temperature: 0.4 // تم تقليل الحرارة لضمان دقة المعلومات وعدم التأليف
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد!*"));
      await sendWA(chatId, "تم اعتماد طلبك يا غالي، هسا الشباب ببلشوا فيه بالمطبخ. نورتنا! 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error Processing"); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) { console.error("WA ERROR"); }
}

app.listen(3000, () => console.log("Saber Bot Corrected Version Running"));
