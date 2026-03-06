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

/* ================= FULL DATA BASE ================= */

const RESTAURANT_INFO = `
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
🗺️ الخريطة: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً | الدفع: كاش، كليك (0796893403)، زين كاش.
`;

const MENU_DATA = `
[العروض والمنيو - ملاحظة: الصدر يعني عائلي ومعه بطاطا]
- صدر شاورما "أبو 6" (6 دنانير): 6 سندويشات + بطاطا عائلي.
- صدر شاورما "أبو 9" (9 دنانير): 8 سندويشات + بطاطا عائلي كبير.
- ديناميت 45 سم: 1 دينار | صاروخ شاورما 45 سم: 1.5 دينار.
- قنبلة رمضان (برجر 250 غم): 2.25 دينار | خابور كباب (45 سم): 2 دينار.
- وجبة فردية (سكالوب/زنجر/برجر): 2 دينار (تشمل بطاطا).
- ساندويش فردي: 1.5 دينار (بدون بطاطا).
- وجبات شاورما فردية: عادي 2، سوبر 2.75، دبل 3.25، تربل 4.
- وجبات سناكات: اقتصادية 7، عائلية 10، عملاقة 14 (كلها مع بطاطا ومشروب).
`;

const DELIVERY_ZONES = `
[قائمة رسوم التوصيل]
- 1.5: صويلح، اشارة الدوريات، مجدي مول، كلية المجتمع العربي.
- 1.75: المختار مول، طلوع نيفين.
- 2: شارع الجامعة، الجبيهة، تلاع العلي، خلدا، المدينة الرياضية، جبل الحسين، الرشيد، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال.
- 2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، الرابية، مجمع الاعمال.
- 3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، جبل عمان، جبل الزهور، جبل القصور.
- 3.5: البيادر، طريق المطار، حي نزال، شارع الحرية، المقابلين.
- 3.6: مرج الحمام.
- 4: جبل النصر (إجباري 4)، وادي السير، ماركا، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة.
- 5: عراق الأمير.
`;

const SYSTEM_PROMPT = `
أنت "صابر بوت". 
🔴 القواعد الصارمة:
1. الصدر (أبو 6 وأبو 9) وجبات عائلية معها بطاطا؛ لا تقل للزبون أنها بدون بطاطا.
2. التوصيل لجبل النصر هو 4 دنانير.
3. لا تطلب الاسم والرقم إلا في نهاية الطلب لتأكيده.
4. ميز بين الساندويش (1.5) والوجبة الفردية (2).

عند التأكيد النهائي، استخدم الصيغة:
[KITCHEN_GO]
الاسم: 
الرقم: 
العنوان: 
الطلب: 
حساب الأكل: 
سعر التوصيل: 
المجموع: 
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
      temperature: 0.2
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد!*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ! نورتنا. 🙏");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) { console.error("WA ERROR"); }
}

app.listen(3000, () => console.log("Saber Bot Master Version Running"));
