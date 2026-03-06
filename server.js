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
[السندويشات - سعر الساندويش فقط]
- ساندويش سكالوب: 1.5 دينار
- ساندويش زنجر: 1.5 دينار
- ساندويش برجر 150غم: 1.5 دينار
- ساندويش شاورما عادي: 1 دينار
- ساندويش شاورما سوبر: 1.5 دينار
- ساندويش ديناميت 45سم: 1 دينار (عرض)
- صاروخ الشاورما 45سم: 1.5 دينار (عرض)
- خابور كباب 45سم: 2 دينار (عرض)
- قنبلة رمضان (برجر 250 جرام): 2.25 دينار

[الوجبات - تشمل بطاطا ومشروب]
- وجبة سكالوب/زنجر/برجر: 2 دينار
- وجبة شاورما: عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د)
- وجبة الشاورما الاقتصادية (صدر أبو 6): 6 دنانير
- وجبة الشاورما العائلية الأوفر (صدر أبو 9): 9 دنانير
- وجبات السناكات العائلية: الاقتصادية (7د)، العائلية (10د)، العملاقة (14د)

[إضافات]
- تحويل أي ساندويش لوجبة: +1 دينار
- بطاطا: (1د عادي، 3د عائلي، 6د جامبو)
- مشروب: (0.35د صغير، 0.50د لتر)
`;

const DELIVERY_DATA = `
1.5د: صويلح، مجدي مول، كلية المجتمع العربي، إشارة الدوريات
1.75د: المختار مول، طلوع نيفين
2د: الجبيهة، ضاحية الرشيد، الجامعة الأردنية، تلاع العلي، صافوط، المدينة الرياضية، جبل الحسين، شارع المدينة المنورة، مكة مول، دوار الواحة، ضاحية الاستقلال
2.25د: الرابية، دوار خلدا، دوار الكيلو
2.5د: خلدا، أم السماق، دابوق، الجاردنز، الشميساني، العبدلي، مجمع الأعمال، المدينة الطبية
3د: الفحيص، شفا بدران، عبدون، الصويفية، جبل عمان، طبربور، وسط البلد، الدوار (1-8)
3.5د: البيادر، طريق المطار، الهاشمي، المقابلين
4د: وادي السير، سحاب، القويسمة، ماركا، أبو علندا، مرج الحمام، الجويدة
5د: عراق الأمير
`;

const SYSTEM_PROMPT = `
أنت مساعد "صابر جو سناك". اتبع هذه الخطوات بدقة:

1. **التمييز بين الساندويش والوجبة:** إذا طلب "ساندويش" احسبه بسعر الساندويش (1.5د مثلاً). لا تقترح تحويله لوجبة (ألغي الـ Up-sell) إلا إذا سأل العميل "كيف أعملها وجبة؟".
2. **البيانات الإجبارية:** - للتوصيل: (المنطقة، الشارع، رقم الهاتف).
   - للاستلام: (الاسم، رقم الهاتف).
3. **مرحلة التأكيد:** بعد عرض السعر النهائي، يجب أن تسأل: "هل ترغب في تأكيد الطلب لإرساله للمطبخ؟".
4. **الإرسال للمطبخ:** لا ترسل صيغة [KITCHEN_GO] إلا بعد أن يوافق العميل صراحة (نعم، أكد، اعتمد).

[تنسيق المطبخ]
عند التأكيد الصريح، أرسل:
[KITCHEN_GO]
🔔 عميل محتمل جديد

👤 الاسم: (اسم العميل)
📱 الهاتف: (رقم الهاتف)
📧 البريد: no-email@saberjo.com

🎯 الاهتمام: (Order Delivery أو Order Pickup)

📝 ملاحظات:
الطلب: (الأصناف والأسعار). التوصيل: (المنطقة والعنوان وسعر التوصيل). المجموع الكلي: (المجموع). الرقم: (الهاتف)
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
        { role: "system", content: SYSTEM_PROMPT + "\nالمنيو:\n" + MENU_DATA + "\nالتوصيل:\n" + DELIVERY_DATA },
        ...session.history.slice(-15),
        { role: "user", content: text }
      ],
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const finalOrder = reply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
      await sendWA(chatId, "تم إرسال طلبك للمطبخ بنجاح! ✅ صحتين وعافية.");
      delete SESSIONS[chatId];
    } else {
      await sendWA(chatId, reply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    }
  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
}

app.listen(3000);
