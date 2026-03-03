import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;
const PORT = process.env.PORT || 3000;

const MENU = `
المنيو:
- ديناميت زينجر: 1 دينار
- برغر لحم: 3.5 دينار

التوصيل:
- عمان: 1 دينار
`;

app.post("/webhook", async (req, res) => {

  // 🔥 مهم جداً — نرد 200 فوراً
  res.sendStatus(200);

  try {

    console.log("🔥 Webhook received:");
    console.log(JSON.stringify(req.body, null, 2));

    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text ||
      req.body.messageData?.textMessageData?.textMessage;

    const chatId = req.body.senderData?.chatId;

    if (!message || !chatId) {
      console.log("⚠️ No message or chatId");
      return;
    }

    console.log("📩 Message:", message);

    // 🔥 تأكد أن المفتاح موجود
    if (!OPENAI_KEY) {
      console.log("❌ OPENAI_KEY missing");
      return;
    }

    // 🧠 طلب OpenAI (غيرنا الموديل)
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

    // 📤 إرسال الرد عبر Green API
await axios.post(
  `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
  {
    chatId: chatId,
    message: reply
  }
);
      }
    );

    console.log("✅ Message sent");

  } catch (error) {
    console.log("❌ ERROR:");
    console.log(error.response?.data || error.message);
  }
});

app.get("/", (req, res) => {
  res.send("Restaurant bot running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
