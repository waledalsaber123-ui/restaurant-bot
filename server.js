import express from "express";
import { sendMessage } from "./whatsapp.js";

const app = express();
app.use(express.json());

const userState = new Map();

async function handleMessage(chatId, text) {
  const msg = String(text || "").trim();
  if (!msg) return;

  if (!userState.has(chatId)) {
    userState.set(chatId, "MENU");
    return sendMessage(
      chatId,
`SERVER TEST 7419

1️⃣ للطلب السريع
2️⃣ للاستفسار
3️⃣ للشكاوى`
    );
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return sendMessage(chatId, `SERVER TEST 7419\n📞 0796893403`);
    }

    if (msg === "2") {
      userState.set(chatId, "HUMAN_SUPPORT");
      return sendMessage(chatId, `SERVER TEST 7419\nتم تحويلك لقسم الاستفسارات`);
    }

    if (msg === "3") {
      userState.set(chatId, "HUMAN_COMPLAINTS");
      return sendMessage(chatId, `SERVER TEST 7419\nتم تحويلك لقسم الشكاوى`);
    }

    return sendMessage(chatId, "SERVER TEST 7419\nاكتب 1 أو 2 أو 3 فقط");
  }

  if (state === "HUMAN_SUPPORT" || state === "HUMAN_COMPLAINTS") {
    return;
  }
}

app.get("/", (req, res) => {
  res.send("SERVER TEST 7419 OK");
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log("SERVER TEST 7419 WEBHOOK:", JSON.stringify(body));

    const webhookType = body?.typeWebhook;
    if (webhookType && webhookType !== "incomingMessageReceived") return;

    const chatId = body?.senderData?.chatId;
    const text =
      body?.messageData?.textMessageData?.textMessage ||
      body?.messageData?.extendedTextMessageData?.text ||
      "";

    if (!chatId || !text) return;

    await handleMessage(chatId, text);
  } catch (error) {
    console.error("SERVER TEST 7419 ERROR:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("SERVER TEST 7419 RUNNING ON PORT", PORT);
});
