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

/* ================= KNOWLEDGE BASE ================= */
const MENU_DATA = `... (ضع هنا المنيو كاملة كما في الكود السابق) ...`;
const DELIVERY_DATA = `... (ضع هنا قائمة التوصيل كاملة كما في الكود السابق) ...`;

const SYSTEM_PROMPT = `
أنت مساعد مطعم Saber Jo Snack. مهمتك استلام الطلب بدقة وتأكيده.

[قواعد صارمة جداً]
1. التمييز: "ساندويش" (1.5د) يختلف عن "وجبة" (2د). لا تقم بتحويل الساندويش لوجبة تلقائياً.
2. جمع البيانات: يجب أن تطلب (الاسم، رقم الهاتف، والعنوان التفصيلي) قبل إنهاء الطلب.
3. التأكيد الصريح: لا ترسل الطلب للمطبخ إلا إذا كتب العميل كلمة (تأكيد، تم، اعتمد، موافق، نعم).
4. إذا لم يوافق العميل صراحة، استمر في وضع الطلب تحت "قيد الانتظار".

[تنسيق الطلب النهائي]
عندما يقول العميل "تم" أو "تأكيد" وكل البيانات (اسم، رقم، عنوان) متوفرة، أرسل الصيغة التالية تبدأ بـ [KITCHEN_GO]:

🔔 عميل محتمل جديد
👤 اسم العميل: (الاسم)
📱 رقم الهاتف: (الرقم)
🎯 النوع: (توصيل أو استلام)
📍 العنوان: (العنوان التفصيلي إذا كان توصيل)
🍔 الأصناف: (قائمة الطلبات)
💰 مجموع الأصناف: (السعر بدون توصيل)
🚗 أجور التوصيل: (حسب المنطقة)
💵 المجموع الكلي: (المجموع النهائي)
──────────────
`;

const SESSIONS = {};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = body.messageData?.textMessageData?.textMessage || "";

  if (text.includes("طلب جديد")) {
    delete SESSIONS[chatId];
    return sendWA(chatId, "أبشر! تم بدء طلب جديد، تفضل شو حابب تطلب؟");
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

    // حالة الإرسال للمطبخ (بعد التأكيد الصريح)
    if (reply.includes("[KITCHEN_GO]")) {
      const finalMsg = reply.replace("[KITCHEN_GO]", "").trim();
      
      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, finalMsg);
      
      // إرسال نفس التنسيق للزبون للتأكيد النهائي
      await sendWA(chatId, "✅ تم اعتماد طلبك بنجاح!\n\n" + finalMsg + "\n\nصحتين وعافية، رح نتواصل معك قريباً.");
      
      delete SESSIONS[chatId]; // إنهاء الجلسة بعد الطلب الناجح
    } else {
      // رد البوت العادي لجمع البيانات أو عرض السعر المبدئي
      await sendWA(chatId, reply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    }
  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
}

app.listen(3000);
