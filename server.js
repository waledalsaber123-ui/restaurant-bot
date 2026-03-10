import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// الإعدادات - تأكد من إضافة هذه القيم في Environment Variables على Render
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// دالة الإرسال الموحدة
async function sendWA(chatId, message) {
  try {
    const url = `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`;
    await axios.post(url, { chatId, message });
    console.log(`✅ تم الإرسال بنجاح إلى: ${chatId}`);
  } catch (err) {
    console.error("❌ خطأ في إرسال الواتساب:", err.response?.data || err.message);
  }
}

const getSystemPrompt = () => {
  return `أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك) في عمان.
لهجتك: أردنية نشمية (يا غالي، أبشر، من عيوني).
📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا.
⏰ الدوام: 2:00 ظهراً - 3:30 فجراً.

⚠️ قواعد العمل:
1. افهم قصد الزبون حتى لو كتب غلط (ذكاء إملائي).
2. لا ترسل للمطبخ إلا بعد موافقة صريحة (تم، اعتمد، ياللا).
3. للطلبات الاستلام: لا تطلب العنوان. للطلبات التوصيل: اطلب المنطقة.
4. المنيو: ديناميت (1 د.أ)، صاروخ شاورما (1.5 د.أ)، قنبلة رمضان (2.25 د.أ)، وجبة عائلية (7 أو 10 أو 14 د.أ).

🚀 عند التأكيد، أرسل الكود التالي مع التفاصيل:
[KITCHEN_GO]
🔔 طلب جديد واصل يا نشامى
- النوع: [توصيل/استلام]
- الاسم والرقم: [بيانات الزبون]
- العنوان: [المنطقة أو استلام]
- الطلب: [التفاصيل]
- المجموع: [السعر الإجمالي] دينار`;
};

app.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.includes("@g.us")) return;

  let userMessage = body.messageData?.textMessageData?.textMessage || 
                    body.messageData?.extendedTextMessageData?.text || 
                    body.messageData?.conversation || "";

  if (!userMessage) return;
  console.log(`📩 رسالة من ${chatId}: ${userMessage}`);

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...(SESSIONS[chatId]?.history?.slice(-10) || []),
        { role: "user", content: userMessage }
      ],
      temperature: 0.3
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };

    if (reply.includes("[KITCHEN_GO]")) {
      const parts = reply.split("[KITCHEN_GO]");
      await sendWA(SETTINGS.KITCHEN_GROUP, parts[1].trim());
      await delay(1000);
      await sendWA(chatId, parts[0].trim() || "أبشر يا غالي، طلبك صار بالمطبخ!");
    } else {
      await delay(1000);
      await sendWA(chatId, reply);
    }

    SESSIONS[chatId].history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: reply }
    );

  } catch (err) {
    console.error("❌ خطأ OpenAI:", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Saber Bot is running on port ${PORT}`));
