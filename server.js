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
  } catch (e) { console.log("خطأ في الإرسال"); }
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

  // البرومبت يحتوي على كل المنيو والعروض وأسعار التوصيل
  const systemPrompt = `
أنت مندوب مبيعات Saber Jo Snack. ردودك مختصرة جداً (شعبنا ما بحب يقرأ).

🍔 المنيو والعروض (من البرومبت):
- ديناميت 45 سم (1د) | صاروخ شاورما (1.5د) | قنبلة رمضان برجر 250غم (2.25د) | خابور كباب (2د).
- وجبات عائلية: اقتصادية (7د)، عائلية (10د)، عملاقة (14د).
- قاعدة الوجبة: أي ساندويش بصير وجبة بزيادة (1د).

🚚 أسعار التوصيل: اعتمد الأسعار الموجودة في ملف التوصيل المرفق ولا تخمن.
📍 الموقع: طلوع هافانا، شارع الجامعة. (http://googleusercontent.com/maps.google.gl/NdFQY67DEnswQdKZ9)

⚠️ نظام الترحيل الإجباري:
عندما يقول العميل "تم" أو "أكد"، أرسل فوراً [KITCHEN_GO] مع:
🔔 طلب جديد
👤 الاسم: [الاسم] | 📱 الهاتف: [الهاتف]
📝 الطلب: [التفاصيل] | التوصيل: [المنطقة] | المجموع: [المجموع].
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...session.history.slice(-3), { role: "user", content: text }],
        temperature: 0
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // ترحيل الطلب للجروب
    if (aiReply.includes("[KITCHEN_GO]")) {
      const finalOrder = aiReply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ! ✅");
      delete SESSIONS[chatId];
      return;
    }

    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    await sendWA(chatId, cleanReply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
