import express from "express";
import bodyParser from "body-parser";
import { sendMessage } from "./whatsapp.js";

const app = express();
app.use(bodyParser.json());

const userState = new Map();

async function handleMessage(chatId, text) {
  const msg = String(text || "").trim();

  if (!userState.has(chatId)) {
    userState.set(chatId, "MENU");
    return sendMessage(
      chatId,
`أهلًا 👋

1️⃣ للطلب السريع
2️⃣ للاستفسار
3️⃣ للشكاوى

اكتب الرقم المطلوب`
    );
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return sendMessage(
        chatId,
`📞 للطلب السريع:
0796893403`
      );
    }

    if (msg === "2") {
      userState.set(chatId, "HUMAN_SUPPORT");
      return sendMessage(
        chatId,
`تم تحويلك لقسم الاستفسارات ✅
سيتم الرد عليك من قبل الموظف.`
      );
    }

    if (msg === "3") {
      userState.set(chatId, "HUMAN_COMPLAINTS");
      return sendMessage(
        chatId,
`نعتذر منك 🙏
تم تحويلك لقسم الشكاوى والمتابعة.
سيتم الرد عليك من قبل الموظف.`
      );
    }

    return sendMessage(chatId, "اكتب 1 أو 2 أو 3 فقط");
  }

  // بعد التحويل لموظف، البوت يسكت
  if (state === "HUMAN_SUPPORT" || state === "HUMAN_COMPLAINTS") {
    return;
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    const chatId =
      body?.senderData?.chatId ||
      body?.messageData?.chatId ||
      body?.chatId;

    const text =
      body?.messageData?.textMessageData?.textMessage ||
      body?.messageData?.extendedTextMessageData?.text ||
      body?.textMessage ||
      body?.text ||
      "";

    if (!chatId) return;

    await handleMessage(chatId, text);
  } catch (error) {
    console.error("Webhook error:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
