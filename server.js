import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // جروب المطبخ المعتمد
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

  // منع الرد على الجروبات نهائياً لضمان الخصوصية وتوفير التكاليف
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  // البرومبت الشامل الذي يحتوي على المنيو والأسعار وقواعد البيع
  const systemPrompt = `
أنت مندوب مبيعات مطعم Saber Jo Snack. 
ممنوع الهلوسة: التزم بالأسعار المكتوبة حرفياً.
ممنوع اختراع أصناف أو عروض.

قائمة الأسعار الأساسية:
- ديناميت 45 سم: 1د | صاروخ شاورما 45 سم: 1.5د | قنبلة رمضان (برجر 250غم): 2.25د | خابور كباب: 2د.
- وجبات عائلية: اقتصادية (7د)، عائلية (10د)، عملاقة (14د).
- شاورما عائلي: اقتصادية 6 ساندويش (6د)، الأوفر 8 ساندويش (9د).
- الساندويشات: (سكالوب، زنجر، برجر 150غم) بـ 1.5د للساندويش.
- قاعدة الوجبات: لتحويل أي ساندويش أو عرض لوجبة (مع بطاطا) ضيف 1 دينار.

الهدف: كن ذكياً، اقترح "ديناميت" بـ 1 دينار دائماً لزيادة الطلب.
قاعدة الرد: ردود قصيرة (أقل من 15 كلمة).
عند الانتهاء وتحديد المنطقة والاسم: أرسل [ORDER_SUMMARY] مع التفاصيل كاملة.
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...session.history.slice(-3), 
          { role: "user", content: text }
        ],
        temperature: 0 // صفر لمنع الهلوسة والالتزام بالحقائق
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // إذا اكتشف الذكاء الاصطناعي أن الطلب اكتمل
    if (aiReply.includes("[ORDER_SUMMARY]")) {
      const finalOrder = aiReply.replace("[ORDER_SUMMARY]", "").trim();
      
      // 1. إرسال للمطبخ (الجروب)
      await sendWA(SETTINGS.KITCHEN_GROUP, `✅ طلب جديد معتمد:\n${finalOrder}\nرقم العميل: ${chatId.split('@')[0]}`);
      
      // 2. رد تأكيدي للعميل
      await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ وجاري التحضير! 🏎️");
      
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
