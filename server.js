import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  SHEET_URL: process.env.DELIVERY_SHEET, // الرابط من الـ Environment Variables
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

// دالة جلب سعر التوصيل من الرابط
async function getDeliveryPrice(areaText) {
  try {
    const res = await axios.get(SETTINGS.SHEET_URL);
    const data = await csv().fromString(res.data);
    // البحث عن المنطقة داخل ملف الـ CSV
    const zone = data.find(d => areaText.toLowerCase().includes(d.area.trim().toLowerCase()));
    return zone ? parseFloat(zone.price) : null;
  } catch (e) {
    console.log("Error fetching delivery prices");
    return null;
  }
}

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
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], deliveryPrice: 0, area: "" };
  const session = SESSIONS[chatId];

  // 1. فحص إذا العميل ذكر منطقة لجلب سعر التوصيل فوراً من الرابط
  // يتم هذا قبل إرسال الطلب للذكاء الاصطناعي لضمان دقة السعر
  const deliveryInSheet = await getDeliveryPrice(text);
  if (deliveryInSheet !== null) {
    session.deliveryPrice = deliveryInSheet;
  }

  const systemPrompt = `
أنت مندوب مبيعات Saber Jo Snack. 
📍 موقعنا: عمّان - شارع الجامعة - طلوع هافانا (https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9).
⚠️ سعر التوصيل الحالي المكتشف للمنطقة: ${session.deliveryPrice} دينار.

قواعد صارمة:
- لا ترسل [CONFIRM_ORDER] إلا بعد عرض ملخص (الأصناف، السعر، التوصيل، المجموع) وموافقة العميل بكلمة "أكد" أو "تم".
- إذا سأل عن الموقع، أرسل الرابط أعلاه فوراً.
- المنيو: ديناميت (1د)، صاروخ (1.5د)، قنبلة (2.25د)، خابور (2د)، وجبات فردية (2د).
- استخدم سعر التوصيل (${session.deliveryPrice}) في حساب المجموع النهائي دائماً.

صيغة الترحيل للجروب:
🔔 عميل محتمل جديد
👤 الاسم: [الاسم]
📱 الهاتف: [الهاتف]
📝 ملاحظات:
الطلب: [التفاصيل]. التوصيل: [المنطقة] (${session.deliveryPrice}د). المجموع النهائي: [المجموع].
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

    if (aiReply.includes("[CONFIRM_ORDER]")) {
      const finalData = aiReply.replace("[CONFIRM_ORDER]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalData);
      await sendWA(chatId, "أبشر يا غالي، تم تأكيد طلبك وإرساله للمطبخ! ✅");
      delete SESSIONS[chatId];
      return;
    }

    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    await sendWA(chatId, cleanReply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
