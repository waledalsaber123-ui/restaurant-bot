import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;

const MENU = `
المنيو:
- ديناميت زينجر: 1 دينار
- برغر لحم: 3.5 دينار

التوصيل:
- عمان: 1 دينار
`;

app.post("/webhook", async (req, res) => {
  // مهم جداً — نرد فوراً
  res.sendStatus(200);

  try {
    console.log("🔥 Webhook triggered");

    // نستقبل فقط الرسائل الجديدة
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text ||
      req.body.messageData?.textMessageData?.textMessage;

    let chatId = req.body.senderData?.chatId;

    if (!message || !chatId) {
      console.log("⚠️ Missing message or chatId");
      return;
    }

    console.log("📩 Message:", message);
    console.log("👤 Original ChatID:", chatId);

    // تصحيح chatId إذا كان ناقص @
    if (!chatId.includes("@c.us")) {
      chatId = chatId.replace("c.us", "@c.us");
    }

    console.log("✅ Fixed ChatID:", chatId);

    // طباعة المتغيرات للتأكد
    console.log("ENV CHECK:");
    console.log("ID_INSTANCE:", ID_INSTANCE);
    console.log("GREEN_TOKEN:", GREEN_TOKEN ? "EXISTS" : "MISSING");
    console.log("OPENAI_KEY:", OPENAI_KEY ? "EXISTS" : "MISSING");

    if (!OPENAI_KEY || !GREEN_TOKEN || !ID_INSTANCE) {
      console.log("❌ ENV VARIABLES MISSING");
      return;
    }

    // طلب OpenAI
    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `أنت مندوب مبيعات مطعم محترف.\n${MENU}`
          },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`
        }
      }
    );

    const reply = ai.data.choices[0].message.content;
    console.log("🤖 AI Reply:", reply);

    // إرسال عبر Green API (Cluster 7103)
    const greenResponse = await axios.post(
      `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
      {
        chatId: chatId,
        message: reply
      }
    );

    console.log("✅ Green API Response:", greenResponse.data);

  } catch (error) {
    console.log("❌ ERROR STATUS:", error.response?.status);
    console.log("❌ ERROR DATA:", error.response?.data);
    console.log("❌ ERROR MESSAGE:", error.message);
  }
});

app.get("/", (req, res) => {
  res.send("Restaurant bot running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
