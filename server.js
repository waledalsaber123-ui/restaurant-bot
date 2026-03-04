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

/* ===========================
   جلب المنيو من Google Sheet
=========================== */
async function getMenuFromSheet() {
  const response = await axios.get(MENU_SHEET_URL);
  const data = await csv().fromString(response.data);

  let menuText = "📋 المنيو:\n\n";

  data.forEach(item => {
    menuText += `🍔 ${item.Name}\n`;
    menuText += `📝 ${item.Description}\n`;
    menuText += `💰 السعر: ${item.Price} دينار\n\n`;
  });

  return menuText;
}

/* ===========================
   جلب اسعار التوصيل
=========================== */
async function getDeliveryFromSheet() {
  const response = await axios.get(DELIVERY_SHEET_URL);
  const data = await csv().fromString(response.data);

  let deliveryText = "🚚 أسعار التوصيل:\n\n";

  data.forEach(item => {
    deliveryText += `📍 ${item.City} : ${item.Price} دينار\n`;
  });

  return deliveryText;
}

/* ===========================
   Webhook
=========================== */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text ||
      req.body.messageData?.textMessageData?.textMessage;

    let chatId = req.body.senderData?.chatId;

    if (!message || !chatId) return;

    console.log("📩 Message:", message);
    console.log("👤 ChatID:", chatId);

    // ❌ تجاهل الجروبات
    if (chatId.includes("@g.us")) {
      console.log("🚫 Group detected - ignoring");
      return;
    }

    // تصحيح chatId لو ناقص @
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
      console.log("❌ Missing ENV variables");
      return;
    }

    /* ===== جلب البيانات من الشيت ===== */
    const MENU = await getMenuFromSheet();
    const DELIVERY = await getDeliveryFromSheet();
    const FULL_MENU = MENU + "\n" + DELIVERY;

    /* ===== طلب OpenAI ===== */
    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `أنت مندوب مبيعات مطعم محترف.
استخدم البيانات التالية للرد على الزبائن:

${FULL_MENU}`
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

    /* ===== ارسال عبر Green API ===== */
    const greenResponse = await axios.post(
      `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
      {
        chatId: chatId,
        message: reply
      }
    );

    console.log("✅ Message sent:", greenResponse.data);

  } catch (error) {
    console.log("❌ ERROR STATUS:", error.response?.status);
    console.log("❌ ERROR DATA:", error.response?.data);
    console.log("❌ ERROR MESSAGE:", error.message);
  }
});

/* ===========================
   Root
=========================== */
app.get("/", (req, res) => {
  res.send("Restaurant bot running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
