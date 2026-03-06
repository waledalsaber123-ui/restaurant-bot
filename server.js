import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ========= الإعدادات الأساسية ========= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  GROUP_ID: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ========= الجلسات الحالية ========= */
const SESSIONS = {};

/* ========= إرسال واتساب ========= */
async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      { chatId, message }
    );
  } catch (err) {
    console.error("WA Error:", err.message);
  }
}

/* ========= Webhook ========= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;

  // إنشاء جلسة جديدة إذا لم تكن موجودة
  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [] };
  }

  const session = SESSIONS[chatId];

  /* ========= البرومبت الشامل (العقل المدبر) ========= 
     ملاحظة: كل التفاصيل (أسعار، مناطق، عروض) صارت هون
  */
  const systemPrompt = `
أنت كاشير ذكي لمطعم "Saber Jo Snack" في الأردن.
تحدث بلهجة أردنية شعبية ولطيفة (مثلاً: يا غالي، من عيوني، أبشر).

1. المنيو والأسعار:
- ديناميت: 1 دينار
- صاروخ شاورما: 1.5 دينار
- قنبلة رمضان: 2.25 دينار
- خابور كباب: 2 دينار
- زنجر / برجر: 1.5 دينار
- شاورما عادي: 1 دينار

2. العروض:
- عرض 1 (ديناميت + بطاطا + بيبسي) = 2.5
- عرض 2 (صاروخ شاورما + بطاطا) = 2
- عرض 3 (برجر + بطاطا + بيبسي) = 2.25

3. مناطق التوصيل:
- الجبيهة، تلاع العلي: 1 دينار
- صويلح، الجامعة: 1.5 دينار
- خلدة، مرج الحمام: 2 دينار
- أي منطقة ثانية: 2.5 دينار

4. القواعد البرمجية (رد عليّ دائماً بهذه الصيغ في نهاية كلامك):
- لإضافة صنف: [ADD:اسم_الصنف:الكمية:السعر_الواحد]
- لتحديد المنطقة: [AREA:اسم_المنطقة:سعر_التوصيل]
- للتأكيد النهائي: [CONFIRM]

5. طريقة التعامل:
- إذا العميل طلب "عرض"، وضّح له العروض المتاحة.
- صحح الكلمات (مثلاً "دينمايتين" تعني ديناميت عدد 2).
- احسب المجموع دائماً في عقلك وأخبر العميل به.
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...session.history.slice(-5), // إرسال آخر 5 رسائل للسياق
          { role: "user", content: text }
        ],
        temperature: 0.3
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    const aiResponse = aiRes.data.choices[0].message.content;
    
    // حفظ المحادثة في الذاكرة المؤقتة
    session.history.push({ role: "user", content: text });
    session.history.push({ role: "assistant", content: aiResponse });

    // معالجة التأكيد النهائي
    if (aiResponse.includes("[CONFIRM]")) {
      const orderSummary = aiResponse.replace(/\[.*?\]/g, "").trim();
      
      // إرسال للمطبخ (الجروب)
      await sendWA(SETTINGS.GROUP_ID, `📌 طلب جديد من ${chatId}:\n${orderSummary}`);
      // رد على العميل
      await sendWA(chatId, "تم اعتماد الطلب يا غالي، ثواني ويكون عندك! 🚗");
      
      // تصفير الجلسة بعد الطلب
      delete SESSIONS[chatId];
      return;
    }

    // تنظيف الرد من الأكواد البرمجية قبل إرساله للعميل
    const cleanReply = aiResponse.replace(/\[.*?\]/g, "").trim();
    await sendWA(chatId, cleanReply);

  } catch (error) {
    console.error("AI Error:", error.response?.data || error.message);
  }
});

app.listen(3000, () => console.log("🚀 Saber Jo Bot is Online"));
