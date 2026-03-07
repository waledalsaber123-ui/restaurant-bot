import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  RESTAURANT_PHONE: "0796893403",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الموحد ================= */
const getSystemPrompt = () => {
  return `
📍 **معلومات الموقع والتواصل**:
- العنوان الرسمي: عمان - شارع الجامعة الأردنية - طلوع هافانا.
- فرعنا الوحيد: يوجد لدينا فرع واحد فقط حالياً.
- لوكيشن المحل: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9

⏰ **ساعات الدوام**:
- نفتح يومياً من الساعة 2:00 ظهراً وحتى الساعة 3:30 فجراً.

💰 **طرق الدفع المتاحة**:
1. كاش عند الاستلام.
2. تحويل CliQ على الرقم: 0796893403.
3. زين كاش.

أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). 

🍔 **المنيو الرسمي**:
الوجبات العائلية: الاقتصادية (7د)، العائلية (10د)، العملاقة (14د).
وجبات الشاورما صدر: الاقتصادية (6د)، العائلية (9د).
وجبات فردية: زنجر/سكالوب/برجر (2د)، شاورما عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د).
عروض خاصة: ديناميت (1د)، صاروخ شاورما (1.5د)، قمبلة رمضان (2.25د)، خابور كباب (2د).
(ملاحظة: تحويل السندويش لوجبة يضيف 1 دينار).

🚚 **مناطق التوصيل**:
[1.5د]: صويلح، الدوريات، مجدي مول.
[2د]: الجبيهة، الجامعة، الرشيد، تلاع العلي، خلدا، الواحة، الصحافة، الحسين.
[2.5د]: دابوق، المدينة الطبية، أم أذينة، الجاردنز، الشميساني، العبدلي، الرابية.
[3د]: الفحيص، الدوار (1-8)، عبدون، الصويفية، عين الباشا، التطبيقية، وسط البلد.
[3.5د]: البيادر، شارع الحرية، الهاشمي، طبربور، الياسمين.
[4د]: وادي السير، ماركا، سحاب، طريق المطار.

⚠️ **قواعد صارمة للإرسال للمطبخ**:
1. لا ترسل كود [KITCHEN_GO] إلا بعد أخذ (الاسم، رقم الهاتف 07، الموقع أو كلمة استلام).
2. عند توفر البيانات، اكتب [KITCHEN_GO] ثم أتبعه بتنسيق الطلب التالي:
   🔔 طلب جديد!
   الاسم: [اسم الزبون]
   الرقم: [رقم الزبون]
   العنوان: [المنطقة أو استلام]
   الطلب: [الأصناف]
   الإجمالي: [المجموع الكلي]
`;
};

/* ================= المحرك الرئيسي المصلح ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  
  if (body.typeWebhook !== "incomingMessageReceived" && body.typeWebhook !== "incomingFileMessageReceived") return;

  const messageId = body.idMessage;
  if (PROCESSED_MESSAGES.has(messageId)) return;
  PROCESSED_MESSAGES.add(messageId);

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = "";
  if (body.messageData?.typeMessage === "textMessage" || body.messageData?.typeMessage === "extendedTextMessage") {
    userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text;
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData.fileMessageData.mimeType.includes("image")) {
    userMessage = await analyzeImage(body.messageData.fileMessageData.downloadUrl);
  }

  if (!userMessage) return;

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-15),
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // --- معالجة الإرسال للمطبخ (إصلاح مشكلة الرسائل الفارغة) ---
    if (reply.includes("[KITCHEN_GO]")) {
      const parts = reply.split("[KITCHEN_GO]");
      const userReply = parts[0].trim(); // النص الذي يذهب للزبون
      const kitchenOrder = parts[1]?.trim(); // النص الذي يذهب للمطبخ

      const hasPhone = /(07[789]\d{7})/.test(reply);
      const hasName = reply.includes("الاسم") && !reply.includes("[اسم الزبون]");

      if (!hasPhone || !hasName || !kitchenOrder) {
        reply = "على راسي يا غالي، بس ياريت تعطيني الاسم ورقم التلفون عشان أقدر أعتمد الطلب وأبعته للمطبخ فوراً.";
        await sendWA(chatId, reply);
      } else {
        // إرسال التأكيد للزبون
        await sendWA(chatId, "أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
        // إرسال التفاصيل الكاملة للمطبخ
        await sendWA(SETTINGS.KITCHEN_GROUP, `✅ *طلب مؤكد من البوت*:\n\n${kitchenOrder}`);
        
        // مسح الجلسة بعد 24 ساعة
        setTimeout(() => { if (SESSIONS[chatId]) delete SESSIONS[chatId]; }, 86400000);
        return;
      }
    } else {
      await sendWA(chatId, reply);
    }

    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

/* ================= وظائف مساعدة ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [
        { type: "text", text: "استخرج اسم الوجبة من صورة العرض هذه." },
        { type: "image_url", image_url: { url: url } }
      ]}]
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    return `[الزبون أرسل صورة عرض]: ${res.data.choices[0].message.content}`;
  } catch (err) { return "صورة عرض"; }
}

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) { console.error("WA Send Error:", err.message); }
}

app.listen(3000, () => console.log("Saber Bot Fixed & Kitchen Group Ready!"));
