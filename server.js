import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ================= RAG: STRUCTURED KNOWLEDGE BASE ================= */

const MENU_DATA = `
[الوجبات العائلية - مخصصة للمجموعات]
- الوجبة الاقتصادية سناكات (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- الوجبة العائلية سناكات (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2 لتر مشروب.
- الوجبة العملاقة سناكات (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3 لتر مشروب.
- وجبة الشاورما الاقتصادية (6 دنانير): صدر يحتوي 6 سندويشات شاورما (48 قطعة) + بطاطا عائلي.
- وجبة الشاورما العائلية الأوفر (9 دنانير): صدر يحتوي 8 سندويشات شاورما (72 قطعة) + بطاطا عائلي كبير.

[عروض السندويشات - السعر للساندويش الواحد]
- ساندويش ديناميت 45سم: 1 دينار.
- صاروخ الشاورما 45سم: 1.5 دينار.
- قنبلة رمضان (برجر 250 جرام): 2.25 دينار.
- خابور كباب 45سم: 2 دينار.
- ساندويش (سكالوب، زنجر، برجر 150غم): 1.5 دينار.
- ساندويش شاورما: عادي (1د)، سوبر (1.5د).
* تحويل أي ساندويش لوجبة (بطاطا + مشروب): إضافة 1 دينار على السعر.

[الوجبات الفردية وسعرها ثابت]
- وجبة (سكالوب، زنجر، برجر): 2 دينار.
- وجبات شاورما: عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د).

[الإضافات]
- بطاطا: عادي (1د)، عائلي (3د)، جامبو (6د).
- مشروب غازي: 250مل (0.35د)، لتر (0.50د).
`;

const DELIVERY_PRICES = `
1.5د: صويلح، مجدي مول، كلية المجتمع العربي، إشارة الدوريات.
1.75د: المختار مول، طلوع نيفين.
2د: الجبيهة، ضاحية الرشيد، الجامعة الأردنية، تلاع العلي، صافوط، المدينة الرياضية، جبل الحسين، شارع المدينة المنورة، مكة مول، دوار الواحة، ضاحية الاستقلال، حي الزيتونة، ضاحية الروضة، ابن عوف.
2.25د: الرابية، دوار خلدا، دوار الكيلو.
2.5د: خلدا، أم السماق، دابوق، الجاردنز، الشميساني، العبدلي، مجمع الأعمال، المدينة الطبية، دير غبار، وادي صقرة، اللويبدة.
3د: الفحيص، شفا بدران، عين الباشا، عبدون، الصويفية، الرونق، الجندويل، الكرسى، جامعة التطبيقية، الدوار (1-8)، وسط البلد، طبربور.
3.5د: البيادر، طريق المطار، الهاشمي، المقابلين، مستشفى البشير، ضاحية الياسمين.
4د: وادي السير، ماركا، سحاب، القويسمة، أبو علندا، خريبة السوق، اليادودة، البنيات، الجويدة، المنارة، ناعور.
5د: عراق الأمير.
`;

/* ================= SYSTEM PROMPT ================= */

const SYSTEM_PROMPT = `
أنت المساعد الذكي لمطعم "صابر جو سناك" (Saber Jo Snack).
العنوان: عمان - شارع الجامعة - طلوع هافانا.

[تعليمات التعامل مع العميل]
1. الأرقام والكميات: كن دقيقاً جداً. إذا طلب العميل "4 قنبلة" احسب السعر (4 * 2.25 = 9 دنانير). لا تخطئ في العدد أبداً.
2. التمييز: الساندويش (1.5د) يختلف عن الوجبة (2د). لا تحول الطلب لوجبة تلقائياً إلا بطلب العميل.
3. البيانات الإجبارية:
   - للتوصيل: يجب أخذ (الاسم، الرقم، المنطقة والشارع).
   - للاستلام: يجب أخذ (الاسم، الرقم).
4. التأكيد الصريح: لا ترسل للمطبخ إلا بعد أن يعطيك العميل موافقة صريحة (نعم، أكد، اعتمد، تم) بعد رؤية المجموع النهائي.

[تنسيق المطبخ - [KITCHEN_GO]]
عند التأكيد الصريح، أرسل الصيغة التالية:
🔔 عميل محتمل جديد
👤 اسم العميل: (الاسم)
📱 رقم الهاتف: (الرقم)
🎯 النوع: (توصيل أو استلام)
📍 العنوان: (إذا توصيل اذكر المنطقة والشارع)
🍔 الأصناف: (اذكر الكمية + الصنف + السعر بالتفصيل)
💰 مجموع الأصناف: (السعر بدون توصيل)
🚗 أجور التوصيل: (حسب المنطقة)
💵 المجموع الكلي: (المجموع النهائي)
──────────────
`;

/* ================= SERVER LOGIC ================= */

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage || "";

  if (text.includes("طلب جديد")) {
    delete SESSIONS[chatId];
    return sendWA(chatId, "أبشر! تم تصفير الطلب، تفضل شو حابب تطلب من جديد؟");
  }

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\nالمنيو:\n" + MENU_DATA + "\nالتوصيل:\n" + DELIVERY_PRICES },
        ...session.history.slice(-15),
        { role: "user", content: text }
      ],
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const finalMsg = reply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalMsg);
      await sendWA(chatId, "✅ تم إرسال طلبك للمطبخ بنجاح! \n\n" + finalMsg + "\n\nصحتين وعافية.");
      delete SESSIONS[chatId];
    } else {
      await sendWA(chatId, reply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    }
  } catch (err) { console.error("AI Logic Error"); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("WA Error"); }
}

app.listen(3000, () => console.log("Saber Jo Bot Active!"));
