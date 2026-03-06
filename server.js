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
🗺️ رابط الموقع: https://maps.app.goo.gl/3547n1mC5X6tE6v78
⏰ الدوام: 2:00 م - 3:30 فجراً.
💰 كليك: 0796893403
`;

const MENU_DATA = `
[مكونات الوجبات العائلية - تشمل بطاطا أساسي]
- وجبة شاورما اقتصادية (6 دنانير): 6 سندويشات (48 قطعة) + بطاطا عائلي.
- وجبة شاورما عائلي (9 دنانير): 8 سندويشات (72 قطعة) + بطاطا عائلي كبير.
- سناكات اقتصادية (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- سناكات عائلية (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر) + 4 بطاطا + 2 لتر مشروب.
- سناكات عملاقة (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر) + 6 بطاطا + 3 لتر مشروب.

[الوجبات الفردية - تشمل بطاطا]
- وجبة سكالوب/زنجر/برجر (150غم): 2 دينار.
- وجبات شاورما: عادي (2)، سوبر (2.75)، دبل (3.25)، تربل (4).

[السندويشات فقط - بدون بطاطا]
- ساندويش سكالوب/زنجر/برجر: 1.5 دينار.
- ساندويش شاورما: عادي (1)، سوبر (1.5).
- ديناميت زنجر (45 سم): 1 دينار | صاروخ شاورما: 1.5 دينار.
- قنبلة رمضان (برجر 250غم): 2.25 دينار | خابور كباب: 2 دينار.
* ملاحظة: لتحويل أي ساندويش لوجبة أضف 1 دينار.
`;

const DELIVERY_ZONES = `
[رسوم التوصيل لـ 200 منطقة]
- 1.5: صويلح، اشارة الدوريات، مجدي مول، كلية المجتمع العربي.
- 1.75: المختار مول، طلوع نيفين.
- 2: تلاع العلي، شارع الجامعة، الجبيهة، الرشيد، المدينة الرياضية، جبل الحسين، نفق الصحافة، مكة مول، ستي مول، المدينة المنورة، ضاحية الاستقلال، حي الجامعة، ابن عوف، حي الديوان، الكمالية، مستشفى التخصصي، دوار الداخلية، صافوط.
- 2.25: حي البركة، الرابية، دوار خلدا، دوار الكيلو.
- 2.5: دابوق، أبو نصير، الجاردنز، الشميساني، العبدلي، اللويبدة، وادي صقرة، مجمع الاعمال، الديار، السهل، الروابي، ام اذينة، الصالحين، المستشفى الإسلامي، خلدا، ام السماق، المدينة الطبية، حي الزيتونة، حي المنصور، عرجان، ضاحية الروضة، ضاحية الامير حسن، استقلال مول.
- 2.75: شارع مكة، دوار المشاغل، شارع عبدالله غوشة، مجمع جبر، مخيم الحسين.
- 3: الفحيص، الدوار 1-8، عبدون، الصويفية، شفا بدران، وسط البلد، طبربور، جبل عمان، دير غبار، الجندويل، الكرسي، عين الباشا، جامعة العلوم التطبيقية، البقعة (جديد).
- 3.5: البيادر، طريق المطار، حي نزال، شارع الحرية، المقابلين، المستندة، الهاشمي الشمالي والجنوبي، جبل الزهور، ضاحية الياسمين.
- 4: جبل النصر، وادي السير، ماركا الشمالية والجنوبية، أبو علندا، القويسمة، اليادودة، البنيات، الجويدة، الرباحية، جبل التاج، جبل الجوفة، الوحدات، وادي الرمم، ام نوارة، جبل المناره، حي عدن، كلية حطين، دوار الجمرك، الاشرفية، ام الحيران، جاوا، سحاب.
- 5: عراق الأمير.
`;

const SYSTEM_PROMPT = `
أنت "صابر". ذاكرتك حديدية (50 رسالة).
🔴 ممنوع إعادة الأسئلة: إذا عرفت نوع الطلب (توصيل/استلام) والمنطقة، لا تسأل عنهم مرة ثانية نهائياً.
🔴 البطاطا مشمولة إجبارياً في الوجبات العائلية والصدور والسناكات والوجبات الفردية.
🔴 السندويش بسعر 1.5 والوجبة بسعر 2 دينار.
🔴 منطقة البقعة توصيلها 3 دنانير.

عند ختم الطلب، أرسل هذا القالب:
[KITCHEN_GO]
الاسم: 
الرقم: 
العنوان (أو استلام): 
الطلب: 
سعر الأكل: 
أجور التوصيل: 
الإجمالي: 
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
        ...session.history.slice(-50), // ذاكرة لـ 50 رسالة لمنع التكرار
        { role: "user", content: text }
      ],
      temperature: 0.1 // دقة عالية جداً
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب جديد!*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ. نورتنا! 🙏");
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

app.listen(3000, () => console.log("Saber Bot Ultra Memory Live"));
