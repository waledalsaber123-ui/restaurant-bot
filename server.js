import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
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

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  const systemPrompt = `
أنت مندوب مبيعات محترف في Saber Jo Snack. كلامك قليل جداً ومختصر.

🧠 [الذكاء اللغوي]:
- افهم الأخطاء الإملائية (مثلاً: شورما، زتجر، كنبلة) واربطها بالصنف فوراً.
- إذا طلب العميل "المنيو"، أرسل القائمة الكاملة أدناه دفعة واحدة.

📋 [المنيو الكامل]:
- العروض: ديناميت الزنجر 45سم (1د)، صاروخ شاورما 45سم (1.5د)، قنبلة رمضان (2.25د)، خابور كباب 250غم (2د).
- عائلي: اقتصادية 7د (4 سندويشات)، عائلية 10د (6 سندويشات)، عملاقة 14د (9 سندويشات).
- شاورما عائلي: اقتصادية 6د (48 قطعة)، أوفر 9د (72 قطعة).
- وجبات فردية (2د): سكالوب، زنجر، برجر 150غم، شاورما عادي. سوبر (2.75د)، دبل (3.25د)، تربل (4د).

🚚 [نظام التوصيل والبيانات]:
- اسأل دائماً: "توصيل ولا استلام من المطعم؟"
- إذا توصيل: اطلب (الاسم الثنائي، رقم الهاتف، المنطقة، العنوان التفصيلي).
- استخدم قائمة التوصيل الشاملة (من صويلح 1.5د إلى عراق الأمير 5د) لذكر السعر فوراً.

✅ [الترحيل الصارم]:
بمجرد التأكيد ("تم" أو "أكد") واستلام البيانات، ابدأ بـ [KITCHEN_GO] بالتنسيق التالي:
[KITCHEN_GO]
🔔 *طلب جديد معتمد - Saber Jo Snack*
━━━━━━━━━━━━
👤 **العميل:** [الاسم] | [الهاتف]
📍 **العنوان:** [المنطقة] - [العنوان التفصيلي]
📝 **الطلب:** [الأصناف والكميات]
💰 **الحساب:** الطلب ([السعر]) + التوصيل ([السعر]) = **الإجمالي ([المجموع الكلي]) د.أ**
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...session.history.slice(-5), { role: "user", content: text }],
        temperature: 0.1
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    if (aiReply.includes("[KITCHEN_GO]")) {
      const finalOrder = aiReply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
      await sendWA(chatId, "أبشر يا غالي، تم تأكيد طلبك وإرساله للمطبخ! ✅");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, aiReply.replace(/\[.*?\]/g, "").trim());
    session.history.push({ role: "user", content: text }, { role: "assistant", content: aiReply });

  } catch (err) { console.log("خطأ تقني"); }
});

app.listen(3000);
