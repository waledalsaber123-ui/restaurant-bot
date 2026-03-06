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

/* ================= KNOWLEDGE BASE (المنيو والمناطق) ================= */
const MENU_DATA = `
[السندويشات - السعر للقطعة الواحدة]
- ساندويش سكالوب: 1.5 دينار
- ساندويش زنجر: 1.5 دينار
- ساندويش برجر 150غم: 1.5 دينار
- ساندويش شاورما عادي: 1 دينار
- ساندويش شاورما سوبر: 1.5 دينار
- ساندويش ديناميت 45سم: 1 دينار
- صاروخ الشاورما 45سم: 1.5 دينار
- خابور كباب 45سم: 2 دينار
- قنبلة رمضان (برجر 250 جرام): 2.25 دينار

[الوجبات الفردية - تشمل بطاطا ومشروب]
- وجبة سكالوب/زنجر/برجر: 2 دينار
- وجبات شاورما: عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د)
- وجبة الشاورما الاقتصادية (صدر أبو 6): 6 دنانير (48 قطعة + بطاطا)
- وجبة الشاورما العائلية الأوفر (صدر أبو 9): 9 دنانير (72 قطعة + بطاطا عائلي)

[الإضافات]
- تحويل أي ساندويش لوجبة: +1 دينار
- بطاطا: (1د عادي، 3د عائلي، 6د جامبو)
- مشروب: (0.35د صغير، 0.50د لتر)
`;

const DELIVERY_ZONES = `
1.5د: صويلح، مجدي مول، كلية المجتمع العربي، إشارة الدوريات.
1.75د: المختار مول، طلوع نيفين.
2د: الجبيهة، ضاحية الرشيد، الجامعة الأردنية، تلاع العلي، صافوط، المدينة الرياضية، جبل الحسين، شارع المدينة المنورة، مكة مول، دوار الواحة، ضاحية الاستقلال.
2.25د: الرابية، دوار خلدا، دوار الكيلو.
2.5د: خلدا، أم السماق، دابوق، الجاردنز، الشميساني، العبدلي، المدينة الطبية.
3د: الفحيص، شفا بدران، عين الباشا، عبدون، الصويفية، الدوار (1-8)، وسط البلد، طبربور.
3.5د: البيادر، طريق المطار، الهاشمي، المقابلين.
4د: وادي السير، سحاب، القويسمة، ماركا، أبو علندا، مرج الحمام، الجويدة.
5د: عراق الأمير.
`;

/* ================= SYSTEM PROMPT ================= */
const SYSTEM_PROMPT = `
أنت مساعد مطعم صابر جو سناك.
مهمتك: قراءة الطلب بدقة وحساب الكميات (مثلاً: 4 قنبلة تعني 4 * 2.25).

[قواعد صارمة]
1. لا ترسل للمطبخ إلا بعد أن يكتب العميل (تأكيد، تم، اعتمد، نعم).
2. يجب جمع: (اسم العميل، رقم الهاتف، العنوان للتوصيل).
3. لا تتجاهل الأرقام المكتوبة (3 قنابل تعني 3 قطع وليس 1).

[تنسيق الطلب للزبون والمطبخ]
عندما يقول العميل "تم" أو "تأكيد"، أرسل الصيغة التالية تبدأ بـ [KITCHEN_GO]:

🔔 عميل محتمل جديد
👤 اسم العميل: (الاسم)
📱 رقم الهاتف: (الرقم)
🎯 النوع: (توصيل أو استلام)
📍 العنوان: (العنوان التفصيلي إذا كان توصيل)
🍔 الأصناف: (اذكر الكمية x الصنف = السعر)
💰 مجموع الأصناف: (المجموع بدون توصيل)
🚗 أجور التوصيل: (حسب المنطقة)
💵 المجموع الكلي: (المجموع النهائي)
──────────────
`;

/* ================= WEBHOOK ================= */
const SESSIONS = {};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage || "";

  if (text.includes("طلب جديد")) {
      delete SESSIONS[chatId];
      await sendWA(chatId, "أبشر، تم تصفير الطلب. تفضل شو حابب تطلب؟");
      return;
  }

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\nالمنيو:\n" + MENU_DATA + "\nالتوصيل:\n" + DELIVERY_ZONES },
        ...session.history.slice(-10),
        { role: "user", content: text }
      ],
      temperature: 0 // درجة حرارة صفر لضمان الدقة الحسابية وعدم الهلوسة
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const finalMsg = reply.replace("[KITCHEN_GO]", "").trim();
      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, finalMsg);
      // إرسال للزبون
      await sendWA(chatId, "✅ أبشر، تم تأكيد طلبك وإرساله للمطبخ بنجاح:\n\n" + finalMsg);
      delete SESSIONS[chatId];
    } else {
      await sendWA(chatId, reply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    }
  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("WA Error"); }
}

app.listen(3000);
