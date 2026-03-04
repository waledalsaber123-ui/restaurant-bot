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
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;

/* ===== الذاكرة ===== */

const sessions = {};
const BOT_STOPPED = {};

function getSession(user) {
  if (!sessions[user]) sessions[user] = [];
  return sessions[user];
}

/* ===== الكاش ===== */

let MENU_CACHE = null;
let DELIVERY_CACHE = null;
let LAST_CACHE = 0;

async function loadData() {
  const now = Date.now();

  if (now - LAST_CACHE < 300000 && MENU_CACHE && DELIVERY_CACHE) return;

  const menuRes = await axios.get(MENU_SHEET_URL);
  const deliveryRes = await axios.get(DELIVERY_SHEET_URL);

  MENU_CACHE = await csv().fromString(menuRes.data);
  DELIVERY_CACHE = await csv().fromString(deliveryRes.data);

  LAST_CACHE = now;
}

/* ===== تنظيف النص ===== */

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, "")
    .trim();
}

/* ===== مطابقة المنطقة ===== */

function findClosestArea(text) {
  const clean = normalize(text);

  for (let row of DELIVERY_CACHE) {
    const area = row.area || row.City;
    const cleanArea = normalize(area);

    if (clean.includes(cleanArea) || cleanArea.includes(clean)) {
      return row;
    }
  }

  return null;
}

/* ===== ارسال رسالة ===== */

async function sendMessage(chatId, message) {
  await axios.post(
    `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
    {
      chatId,
      message
    }
  );
}

/* ===== تحليل الصور ===== */

async function analyzeImage(url) {
  const ai = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "اشرح الصورة باختصار" },
            { type: "image_url", image_url: { url } }
          ]
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return ai.data.choices[0].message.content;
}

/* ===== Webhook ===== */

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {

    if (req.body.typeWebhook !== "incomingMessageReceived") return;

    const message =
      req.body.messageData?.extendedTextMessageData?.text ||
      req.body.messageData?.textMessageData?.textMessage;

    const imageUrl =
      req.body.messageData?.imageMessageData?.downloadUrl;

    let chatId = req.body.senderData?.chatId;

    if (!chatId) return;
    if (chatId.includes("@g.us")) return;

    if (!chatId.includes("@c.us")) {
      chatId = chatId.replace("c.us", "@c.us");
    }

    await loadData();

    if (!message && !imageUrl) return;

    const text = normalize(message || "");

    /* ===== اوامر التحكم ===== */

    if (text.includes("توقف بوت") || text.includes("وقف بوت")) {
      BOT_STOPPED[chatId] = true;
      await sendMessage(chatId, "⛔ تم إيقاف البوت");
      return;
    }

    if (text.includes("كمل بوت") || text.includes("شغل بوت")) {
      BOT_STOPPED[chatId] = false;
      await sendMessage(chatId, "✅ تم تشغيل البوت");
      return;
    }

    if (BOT_STOPPED[chatId]) return;

    /* ===== تحليل الصور ===== */

    if (imageUrl) {
      const analysis = await analyzeImage(imageUrl);
      await sendMessage(chatId, analysis);
      return;
    }

    /* ===== عرض المنيو ===== */

    if (text.includes("منيو")) {

      let menuText = "📋 المنيو:\n\n";

      MENU_CACHE.forEach(item => {
        menuText += `🍔 ${item.Name} - ${item.Price} دينار\n`;
      });

      await sendMessage(chatId, menuText);
      return;
    }

    /* ===== التوصيل ===== */

    const area = findClosestArea(text);

    if (area) {

      const name = area.area || area.City;
      const price = area.price || area.Price;

      await sendMessage(
        chatId,
        `🚚 التوصيل إلى ${name} يكلف ${price} دينار`
      );

      return;
    }

    /* ===== منع الهلوسة ===== */

    const allowedItems = MENU_CACHE.map(i => i.Name).join(", ");

    const SYSTEM = SYSTEM_PROMPT || `
أنت مساعد مطعم Saber Jo Snack في عمان.

لا تخترع أصناف أو أسعار.

الأصناف المتوفرة:
${allowedItems}

افهم الأخطاء الإملائية.

زنكر = زنجر
بركر = برجر

كن مختصر في الرد.
`;

    const history = getSession(chatId);

    history.push({
      role: "user",
      content: message
    });

    const lastMessages = history.slice(-30);

    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM },
          ...lastMessages
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = ai.data.choices[0].message.content;

    history.push({
      role: "assistant",
      content: reply
    });

    await sendMessage(chatId, reply);

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
