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

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  const systemPrompt = `
أنت مندوب مبيعات Saber Jo Snack المحترف. كلامك قليل ومركز.

📋 [المنيو الكاملة - ترسل عند طلبها]:
1. العروض: ديناميت 45سم (1د)، صاروخ شاورما (1.5د)، قنبلة رمضان (2.25د)، خابور كباب (2د).
2. وجبات عائلية: اقتصادية (7د)، عائلية (10د)، عملاقة (14د).
3. شاورما عائلي: اقتصادية 48 قطعة (6د)، الأوفر 72 قطعة (9د).
4. فردي (2د): سكالوب، زنجر، برجر، شاورما عادي. شاورما سوبر (2.75د)، دبل (3.25د)، تربل (4د).

🧠 [التعليمات الاحترافية]:
- افهم الأخطاء الإملائية فوراً (مثلاً: شورمة، زتجر، كنبلة).
- اسأل دائماً أولاً: "توصيل ولا استلام؟".
- إذا توصيل: اطلب (الاسم الثنائي، الهاتف، المنطقة، العنوان التفصيلي).
- إذا استلام: اطلب (الاسم الثنائي والهاتف).
- اذكر سعر التوصيل من القائمة فوراً (مثال: صويلح 1.5د، مرج الحمام 3.6د).
- لا ترحل الطلب ولا تضع ✅ إلا بعد كتابة العميل كلمة "أكد" أو "تم" بشكل صريح.

✅ [تنسيق المطبخ]:
[KITCHEN_GO]
🔔 *طلب جديد معتمد - Saber Jo Snack*
━━━━━━━━━━━━
👤 **العميل:** [الاسم] | [الهاتف]
📍 **النوع:** [توصيل / استلام]
📍 **العنوان:** [العنوان أو "استلام من المطعم"]
📝 **الطلب:** [الأصناف بوضوح]
💰 **الحساب:** الطلب ([السعر]) + التوصيل ([السعر]) = **الإجمالي ([المجموع الكلي]) د.أ**
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...session.history.slice(-6), { role: "user", content: text }],
        temperature: 0.1
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    if (aiReply.includes("[KITCHEN_GO]")) {
      const finalOrder = aiReply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
      await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ وجاري التحضير! ✅");
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, aiReply.replace(/\[.*?\]/g, "").trim());
    session.history.push({ role: "user", content: text }, { role: "assistant", content: aiReply });

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
