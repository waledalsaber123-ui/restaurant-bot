import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      { chatId, message }
    );
  } catch (e) {
    console.log("WhatsApp Send Error", e.message);
  }
}

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

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = {
      history: [],
      order: null,
      address: null,
      phone: null
    };
  }

  const session = SESSIONS[chatId];

  const dynamicPrompt = process.env.SYSTEM_PROMPT;

  const SYSTEM = `
${dynamicPrompt}

قواعد البوت:

انت موظف طلبات لمطعم.

المهام:
1 استقبل طلب العميل
2 تأكد من الأصناف من المنيو فقط
3 احسب السعر بدقة
4 اطلب العنوان
5 اطلب رقم الهاتف
6 اعرض ملخص الطلب
7 اطلب تأكيد

عند تأكيد الطلب اكتب في بداية الرسالة:

[KITCHEN_GO]

ولا تستخدمه قبل التأكيد.

صيغة الطلب للمطبخ:

طلب جديد

الاصناف:
...

المجموع:
...

الاسم:
...

الهاتف:
...

العنوان:
...
`;

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM },
          ...session.history.slice(-6),
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${SETTINGS.OPENAI_KEY}`
        }
      }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // إذا تم تأكيد الطلب
    if (aiReply.includes("[KITCHEN_GO]")) {

      const order = aiReply.replace("[KITCHEN_GO]", "").trim();

      await sendWA(SETTINGS.KITCHEN_GROUP, order);

      await sendWA(chatId, "تم تأكيد طلبك وارساله للمطبخ 👨‍🍳✅");

      delete SESSIONS[chatId];

      return;
    }

    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();

    if (cleanReply) {

      await sendWA(chatId, cleanReply);

      session.history.push(
        { role: "user", content: text },
        { role: "assistant", content: cleanReply }
      );
    }

  } catch (err) {
    console.log("AI Error", err.response?.data || err.message);
  }
});

app.listen(3000, () => {
  console.log("Restaurant Bot Running");
});
