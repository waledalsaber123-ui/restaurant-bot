import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // جروب المطبخ (إرسال فقط)
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("WA Error"); }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;

  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;

  // 1. منع الرد نهائياً على أي جروب (بما فيهم جروب المطبخ)
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  // 2. برومبت المندوب الذكي (قصير، حاسم، وبدون هلوسة)
  const systemPrompt = `
أنت مندوب مبيعات شاطر ومختصر لمطعم "Saber Jo Snack".
لهجتك: أردنية شبابية (يا غالي، أبشر، تم).
هدفنا: نبيع ونخلص.

المنيو (ممنوع الزيادة):
- ديناميت/عادي: 1د | صاروخ: 1.5د | زنجر/برجر: 1.5د | كباب: 2د | قنبلة: 2.25د.
- التوصيل: (الجبيهة/تلاع العلي: 1د) | (صويلح/الجامعة: 1.5د) | (غيره: 2د).

القواعد:
- الرد ممنوع يتعدى 10-15 كلمة.
- لا تعيد المنيو كامل، بس جاوب على قد السؤال.
- بس يحدد (الطلب + المنطقة)، أرسل كود [DONE] مع السعر النهائي.
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...session.history.slice(-2), { role: "user", content: text }],
        temperature: 0 // صفر لمنع الهلوسة تماماً
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // 3. معالجة الطلب المؤكد وإرساله للجروب المذكور
    if (aiReply.includes("[DONE]")) {
      const orderInfo = aiReply.replace("[DONE]", "").trim();
      
      // إرسال لجروب المطبخ المذكور (120363407952234395@g.us)
      await sendWA(SETTINGS.KITCHEN_GROUP, `🔔 طلب جديد:\n${orderInfo}\nرقم: ${chatId.split('@')[0]}`);
      
      // رد نهائي للعميل
      await sendWA(chatId, "أبشر يا غالي، الطلب صار عند المطبخ وبنكلمك بس يطلع! ✅");
      delete SESSIONS[chatId]; 
      return;
    }

    // تنظيف الرد وإرساله للخاص فقط
    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    if (cleanReply) {
      await sendWA(chatId, cleanReply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });
    }

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
