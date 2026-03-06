import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // جروب المطبخ
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("خطأ في إرسال واتساب"); }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  const systemPrompt = `
أنت مندوب مبيعات محترف وذكي لمطعم Saber Jo Snack (عمان - شارع الجامعة - طلوع هافانا).
لهجتك: أردنية شبابية (يا غالي، أبشر، على راسي).

قواعد البيع (المنيو):
- العروض القوية (نركز عليها): ديناميت 45 سم (1د)، صاروخ شاورما (1.5د)، قنبلة رمضان برجر 250غم (2.25د)، خابور كباب 200غم (2د).
- قاعدة الوجبة: أي ساندويش أو عرض بدك اياه "وجبة" مع بطاطا، ضيف 1 دينار.
- وجبات عائلية: اقتصادية 7د (4 ساندويش)، عائلية 10د (6 ساندويش)، عملاقة 14د (9 ساندويش).
- شاورما عائلي: اقتصادية 6 ساندويش (6د)، الأوفر 8 ساندويش (9د).
- فردي: وجبة سكالوب/زنجر/برجر (2د). ساندويش سكالوب/زنجر/برجر (1.5د).

موقع المطعم (ترسله فقط إذا طلب العميل الموقع/اللوكيشن):
شارع الجامعة الأردنية – عمّان – طلوع هافانا
https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9

شروط ترحيل الطلب:
1. لا تنهي الطلب إلا بعد جمع (الاسم، الهاتف، المنطقة، تفصيل الطلب).
2. اعرض السعر النهائي (الطلب + التوصيل) واسأل العميل "أثبت؟".
3. عند التأكيد النهائي، أرسل الكود [CONFIRM_ORDER] متبوعاً بالصيغة التالية:

🔔 عميل محتمل جديد
👤 الاسم: [الاسم]
📱 الهاتف: [الهاتف]
📧 البريد: no-email@saberjo.com
🎯 الاهتمام: Order Delivery
📝 ملاحظات:
الطلب: [التفصيل]. التوصيل: [المنطقة والسعر]. المجموع: [المجموع النهائي]. الرقم: [الهاتف]
──────────────
📌 المصدر: WhatsApp
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...session.history.slice(-5), { role: "user", content: text }],
        temperature: 0
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // ترحيل الطلب للجروب بصيغة احترافية
    if (aiReply.includes("[CONFIRM_ORDER]")) {
      const finalOrder = aiReply.replace("[CONFIRM_ORDER]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
      await sendWA(chatId, "أبشر يا غالي، تم تأكيد طلبك وإرساله للمطبخ فوراً! 🏎️");
      delete SESSIONS[chatId];
      return;
    }

    // الرد العادي على العميل
    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    if (cleanReply) {
      await sendWA(chatId, cleanReply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });
    }

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
