import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // الجروب المطلوب
  SHEET_URL: process.env.DELIVERY_SHEET, // رابط الأسعار
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

// دالة جلب أسعار التوصيل من الرابط لضمان عدم الخطأ
async function getDeliveryPrice(areaName) {
  try {
    const res = await axios.get(SETTINGS.SHEET_URL);
    const data = await csv().fromString(res.data);
    const zone = data.find(d => areaName.toLowerCase().includes(d.area.trim().toLowerCase()));
    return zone ? zone.price : "سيتم تحديده لاحقاً";
  } catch (e) { return "1.5"; } // سعر افتراضي في حال فشل الربط
}

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("Error sending to WA"); }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return; // ممنوع الرد داخل الجروبات

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  // البرومبت الآن هو الدستور الأساسي للبوت
  const systemPrompt = `
أنت مندوب مبيعات محترف لمطعم Saber Jo Snack.
ممنوع نهائياً قول "لا أعرف" أو "لا أملك معلومات". أي معلومة تنقصك، ارجع لهذا النص:

📍 الموقع واللوكيشن (أرسله فوراً إذا طلب العميل):
شارع الجامعة الأردنية – عمّان – طلوع هافانا.
الرابط: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9

🍔 المنيو والأسعار (التزم بها حرفياً):
- ديناميت 45 سم: 1د.
- صاروخ شاورما 45 سم: 1.5د.
- قنبلة رمضان (برجر 250غم): 2.25د.
- خابور كباب: 2د.
- الوجبات العائلية: اقتصادية (7د)، عائلية (10د)، عملاقة (14د).
- قاعدة الوجبات: الساندويش بـ 1.5د، والوجبة بـ 2د (زيادة دينار لتحويل أي ساندويش لوجبة).

⚠️ تعليمات إرسال الطلب للجروب:
عندما يوافق العميل على الملخص النهائي، يجب أن تنهي ردك بكود [SEND_NOW] متبوعاً بالتفاصيل التالية:
🔔 عميل محتمل جديد
👤 الاسم: [الاسم]
📱 الهاتف: [الهاتف]
📝 ملاحظات:
الطلب: [الأصناف]. التوصيل: [المنطقة]. المجموع النهائي: [المجموع].
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

    // ترحيل الطلب للجروب بشكل إجباري عند وجود الكود
    if (aiReply.includes("[SEND_NOW]")) {
      const orderDetails = aiReply.replace("[SEND_NOW]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, orderDetails); // الإرسال للجروب
      await sendWA(chatId, "أبشر يا غالي، تم تأكيد طلبك وإرساله للمطبخ فوراً! 🏎️");
      delete SESSIONS[chatId];
      return;
    }

    // الرد العادي على الزبون
    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    await sendWA(chatId, cleanReply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
