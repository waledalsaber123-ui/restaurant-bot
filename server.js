import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // جروب المطبخ
  SHEET_URL: process.env.DELIVERY_SHEET, // رابط أسعار التوصيل
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

  // البرومبت المختصر والقوي
  const systemPrompt = `
أنت مندوب Saber Jo Snack. ردودك قصيرة جداً (كلمتين وبس).

📍 الموقع: طلوع هافانا، شارع الجامعة. الرابط: (https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9)
🚚 أسعار التوصيل: اعتمد السعر من الرابط المرفق (SHEET_URL) ولا تخترع أسعار.

💰 المنيو السريع: ديناميت (1د)، صاروخ (1.5د)، قنبلة (2.25د)، خابور (2د). ساندويش (1.5د)، وجبة (2د).

⚠️ قاعدة الترحيل الإجبارية:
أول ما العميل يقول "تم" أو "أكد"، أرسل الكود [KITCHEN_GO] فوراً متبوعاً بملخص الطلب، الاسم، والمنطقة للجروب.
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

    // الإرسال الإجباري للمطبخ عند تأكيد الطلب
    if (aiReply.includes("[KITCHEN_GO]")) {
      const finalOrder = aiReply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `🔔 طلب جديد معتمد:\n${finalOrder}`);
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
