import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;
const MENU_SHEET_URL = process.env.MENU_SHEET_URL;
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL;

/* ===== جلب المنيو ===== */
async function getMenuFromSheet() {
  const response = await axios.get(MENU_SHEET_URL);
  const data = await csv().fromString(response.data);

  let text = "📋 المنيو:\n\n";

  data.forEach(item => {
    text += `🍔 ${item.Name}\n`;
    text += `💰 السعر: ${item.Price} دينار\n\n`;
  });

  return text;
}

/* ===== جلب التوصيل ===== */
async function getDeliveryFromSheet() {
  const response = await axios.get(DELIVERY_SHEET_URL);
  const data = await csv().fromString(response.data);

  let text = "🚚 أسعار التوصيل:\n\n";

  data.forEach(item => {
    text += `📍 ${item.City} : ${item.Price} دينار\n`;
  });

  return text;
}

/* ===== Webhook ===== */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text ||
      req.body.messageData?.textMessageData?.textMessage;

    let chatId = req.body.senderData?.chatId;

    if (!message || !chatId) return;

    // تجاهل الجروبات
    if (chatId.includes("@g.us")) return;

    if (!chatId.includes("@c.us")) {
      chatId = chatId.replace("c.us", "@c.us");
    }

    if (
      !OPENAI_KEY ||
      !GREEN_TOKEN ||
      !ID_INSTANCE ||
      !MENU_SHEET_URL ||
      !DELIVERY_SHEET_URL
    ) {
      console.log("Missing ENV variables");
      return;
    }

    const MENU = await getMenuFromSheet();
    const DELIVERY = await getDeliveryFromSheet();
    const FULL = MENU + "\n" + DELIVERY;

    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `أنت مندوب مطعم. استخدم المعلومات التالية:\n${FULL}`
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

    await axios.post(
      `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
      {
        chatId: chatId,
        message: reply
      }
    );

  } catch (error) {
    console.log("ERROR:", error.response?.data || error.message);
  }
});

app.get("/", (req, res) => {
  res.send("Bot running 🚀");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
