import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;

/* ========================= */
/* CHECK ENV VARIABLES */
/* ========================= */

if (!OPENAI_KEY || !GREEN_TOKEN || !ID_INSTANCE || !SYSTEM_PROMPT) {
console.log("⚠️ Missing environment variables");
}

/* ========================= */
/* SEND MESSAGE TO WHATSAPP */
/* ========================= */

async function send(chatId, message) {

try {

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId: chatId,
message: message
}
);

} catch (error) {

console.log("GreenAPI ERROR:", error.response?.data || error.message);

}

}

/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req, res) => {

res.sendStatus(200);

try {

if (req.body.typeWebhook !== "incomingMessageReceived") return;

const message =
req.body.messageData?.extendedTextMessageData?.text ||
req.body.messageData?.textMessageData?.textMessage;

let chatId = req.body.senderData?.chatId;

if (!chatId) return;

if (chatId.includes("@g.us")) return;

console.log("📩 Incoming:", message);

/* ========================= */
/* OPENAI RESPONSE */
/* ========================= */

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model: "gpt-4o-mini",
messages: [
{
role: "system",
content: SYSTEM_PROMPT
},
{
role: "user",
content: message
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

const reply = ai.data.choices[0].message.content;

console.log("🤖 AI Reply:", reply);

/* ========================= */
/* SEND TO WHATSAPP */
/* ========================= */

await send(chatId, reply);

} catch (error) {

console.log("❌ BOT ERROR:", error.response?.data || error.message);

}

});

/* ========================= */
/* ROOT ROUTE */
/* ========================= */

app.get("/", (req, res) => {

res.send("Restaurant Bot Running 🚀");

});

/* ========================= */
/* START SERVER */
/* ========================= */

app.listen(PORT, () => {

console.log(`🚀 Restaurant Bot Running on port ${PORT}`);

});
