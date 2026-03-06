import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= SETTINGS ================= */

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ================= SESSION MEMORY ================= */

const SESSIONS = {};
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/* ================= SEND WHATSAPP ================= */

async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      { chatId, message }
    );
  } catch (err) {
    console.log("WA ERROR:", err.message);
  }
}

/* ================= CLEAN TEXT ================= */

function cleanText(text) {
  return text
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ================= SYSTEM PROMPT ================= */

const SYSTEM = `
${SETTINGS.SYSTEM_PROMPT}

STRICT RULES:

- Never change menu prices
- Never invent menu items
- Only use items from the menu
- Delivery fee must match delivery list exactly
- Speak Arabic

ORDER FLOW:

1 Receive order
2 Verify items exist in menu
3 Calculate price
4 Ask delivery area
5 Calculate delivery fee
6 Ask phone number
7 Show summary
8 Ask confirmation

ONLY when customer confirms order start message with:

[KITCHEN_GO]

Kitchen format:

طلب جديد

الاصناف:
...

المجموع:
...

الهاتف:
...

العنوان:
...
`;

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  const body = req.body;

  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text =
    body.messageData?.textMessageData?.textMessage ||
    body.messageData?.extendedTextMessageData?.text ||
    "";

  if (!text.trim()) return;

  /* ===== SESSION ===== */

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = {
      history: [],
      lastActive: Date.now()
    };
  }

  const session = SESSIONS[chatId];
  session.lastActive = Date.now();

  /* ===== DELETE OLD SESSIONS ===== */

  Object.keys(SESSIONS).forEach(id => {
    if (Date.now() - SESSIONS[id].lastActive > SESSION_TIMEOUT) {
      delete SESSIONS[id];
    }
  });

  try {

    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0,
        top_p: 0,
        max_tokens: 120,
        messages: [
          { role: "system", content: SYSTEM },
          ...session.history.slice(-6),
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${SETTINGS.OPENAI_KEY}`
        },
        timeout: 15000
      }
    );

    let reply = ai.data.choices[0].message.content;

    /* ===== SEND ORDER TO KITCHEN ===== */

    if (reply.includes("[KITCHEN_GO]")) {

      const order = cleanText(reply);

      await sendWA(SETTINGS.KITCHEN_GROUP, order);

      await sendWA(chatId, "تم إرسال طلبك للمطبخ 👨‍🍳✅");

      delete SESSIONS[chatId];

      return;
    }

    const cleanReply = cleanText(reply);

    if (cleanReply) {

      await sendWA(chatId, cleanReply);

      session.history.push(
        { role: "user", content: text },
        { role: "assistant", content: cleanReply }
      );

      if (session.history.length > 12) {
        session.history = session.history.slice(-6);
      }
    }

  } catch (err) {

    console.log("AI ERROR:", err.response?.data || err.message);

    await sendWA(chatId, "صار خطأ بسيط، حاول مرة ثانية 🙏");
  }

});

/* ================= SERVER ================= */

app.listen(3000, () => {
  console.log("🚀 Saber Jo Snack Bot Running");
});
