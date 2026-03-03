import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const OPENAI_KEY = "PUT_OPENAI_KEY_HERE";
const GREEN_TOKEN = "PUT_GREEN_TOKEN_HERE";
const ID_INSTANCE = "PUT_ID_INSTANCE_HERE";

const MENU = `
المنيو:
- ديناميت زينجر: 1 دينار
- برغر لحم: 3.5 دينار
التوصيل:
- عمان: 1 دينار
`;

app.post("/webhook", async (req, res) => {
  const message = req.body.messageData?.extendedTextMessageData?.text;
  const chatId = req.body.senderData?.chatId;

  if (!message) return res.sendStatus(200);

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
        Authorization: `Bearer ${OPENAI_KEY}`
      }
    }
  );

  const reply = ai.data.choices[0].message.content;

  await axios.post(
    `https://api.green-api.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
    {
      chatId,
      message: reply
    }
  );

  res.sendStatus(200);
});

app.listen(3000);
