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
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) {
    console.error("Error sending:", err.message);
  }
}

const getSystemPrompt = () => {
  return `
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك) في عمان.
لهجتك: أردنية نشمية (يا غالي، أبشر، من عيوني).

⚠️ **قواعد ذهبية للطلبات**:
1. **الذكاء الإملائي**: افهم قصد الزبون حتى لو كتب غلط (مثلاً: "زنجر" بدل "زنجار"، "شاورما" بدل "شورما").
2. **الموافقة الصريحة**: لا ترسل الطلب للمطبخ أبداً إلا إذا قال الزبون كلمة تأكيد واضحة (تم، اعتمد، اوكي، ياللا، ماشي، توكل على الله).
3. **ملخص الطلب**: قبل التأكيد، لازم تعرض على الزبون الملخص (الأكل + السعر + نوع الطلب "توصيل أو استلام").

📍 **الموقع**: عمان - شارع الجامعة الأردنية.
⏰ **الدوام**: 2:00 ظهراً - 3:30 فجراً.

📋 **المنيو المختصر**:
- ساندويش ديناميت: 1 د.أ | صاروخ شاورما: 1.5 د.أ | قنبلة رمضان: 2.25 د.أ.
- وجبات عائلية: اقتصادية (7 د.أ)، عائلية (10 د.أ)، عملاقة (14 د.أ).
- التوصيل: حسب المنطقة (مثلاً شارع الجامعة 2 د.أ).

🚀 **عند التأكيد النهائي (ارسل للمطبخ فوراً)**:
استخدم الكود [KITCHEN_GO] متبوعاً بالتفاصيل التالية:
[KITCHEN_GO]
🔔 **طلب جديد واصل يا نشامى**
- **النوع**: [توصيل 🚚 / استلام من المحل 📍]
- **الاسم**: [اسم الزبون]
- **الرقم**: [رقم الهاتف]
- **العنوان**: [المنطقة بالتفصيل أو "استلام من المحل"]
- **الطلب**: [الأصناف + الملاحظات]
- **المجموع**: [السعر الإجمالي شامل التوصيل] دينار
---------------------------------
`;
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

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...(SESSIONS[chatId]?.history?.slice(-12) || []),
        { role: "user", content: userMessage }
      ],
      temperature: 0.3 // تقليل الرقم لزيادة الدقة ومنع الهبد
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };

    if (reply.includes("[KITCHEN_GO]")) {
      const parts = reply.split("[KITCHEN_GO]");
      const clientConfirm = parts[0].trim() || "أبشر يا غالي، طلبك صار بالمطبخ وهسا الشباب ببلشوا فيه! 🍔";
      const kitchenOrder = parts[1].trim();

      // إرسال لجروب المطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, kitchenOrder);
      await delay(1000);
      // إرسال تأكيد للزبون
      await sendWA(chatId, clientConfirm);
    } else {
      await delay(1500);
      await sendWA(chatId, reply);
    }

    SESSIONS[chatId].history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: reply }
    );

  } catch (err) {
    console.error("Error:", err.message);
  }
});

app.listen(3000, () => console.log("Saber Bot is Ready! 🚀"));
