import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

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

  // 🔥 مهم جداً — نرد 200 فوراً
  res.sendStatus(200);

  try {

    console.log("🔥 Webhook received:", JSON.stringify(req.body));

    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text;

    const chatId = req.body.senderData?.chatId;

    if (!message || !chatId) return;

    // 🧠 طلب OpenAI
    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
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

    // 📤 إرسال الرد عبر Green API
    await axios.post(
      `https://api.green-api.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
      {
        chatId: chatId,
        message: reply
      }
    );

  } catch (error) {
    console.log("❌ ERROR:", error.response?.data || error.message);
  }
});

app.get("/", (req, res) => {
  res.send("Restaurant bot running 🚀");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
