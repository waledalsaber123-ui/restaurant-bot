import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================== الإعدادات ================== */

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT
};

const SESSIONS = {};

/* ================= استخراج بيانات ================= */

const extractPhone = (text) => {
  const match = text.match(/(07[789][0-9]{7})/);
  return match ? match[0] : null;
};

const extractAddress = (text) => {
  if (
    text.includes("شارع") ||
    text.includes("حي") ||
    text.includes("منطقة") ||
    text.includes("جنب") ||
    text.includes("قرب")
  ) {
    return text;
  }
  return null;
};

/* ================= تحقق من اكتمال الطلب ================= */

function validateOrder(order) {

  if (!order.name) return "الاسم";
  if (!order.phone) return "رقم الهاتف";

  if (order.type === "delivery" && !order.address)
    return "العنوان";

  if (!order.itemsString) return "الطلب";
  if (!order.total || order.total == 0) return "المجموع";

  return null;
}

/* ================= ارسال رسالة ================= */

async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      {
        chatId,
        message
      }
    );
  } catch (err) {
    console.log("Send error", err.message);
  }
}

/* ================= webhook ================= */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  const body = req.body;

  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId =
    body.senderData?.chatId ||
    body.senderData?.sender ||
    body.senderData?.senderId;

  if (!chatId) return;

  if (chatId.endsWith("@g.us") && chatId !== SETTINGS.KITCHEN_GROUP) return;

  let userMessage =
    body.messageData?.textMessageData?.textMessage ||
    body.messageData?.extendedTextMessageData?.text ||
    "";

  if (!userMessage) return;

  /* ================= إنشاء جلسة ================= */

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = {
      history: [],
      awaitingConfirmation: false,
      pendingOrder: {
        name: null,
        phone: null,
        address: null,
        itemsString: null,
        total: 0,
        type: "delivery"
      }
    };
  }

  const session = SESSIONS[chatId];

  /* ================= تحديث البيانات ================= */

  const phone = extractPhone(userMessage);
  if (phone) session.pendingOrder.phone = phone;

  const address = extractAddress(userMessage);
  if (address) session.pendingOrder.address = address;

  if (userMessage.includes("استلام") || userMessage.includes("بالمحل")) {
    session.pendingOrder.type = "pickup";
  }

  /* ================= تأكيد الطلب ================= */

  const isConfirm =
    /^(تم|اوكي|ok|yes|confirm|تمام)$/i.test(userMessage.trim());

  if (session.awaitingConfirmation && isConfirm) {

    const missing = validateOrder(session.pendingOrder);

    if (missing) {
      await sendWA(chatId, `قبل تأكيد الطلب لازم تعطيني: *${missing}* 🙏`);
      return;
    }

    const order = session.pendingOrder;

    const kitchenMessage =

`🔥 طلب جديد

الاسم: ${order.name}
الرقم: ${order.phone}
النوع: ${order.type === "pickup" ? "استلام" : "توصيل"}

العنوان: ${order.address || "-"}

الطلب:
${order.itemsString}

المجموع: ${order.total} د.أ
`;

    await sendWA(SETTINGS.KITCHEN_GROUP, kitchenMessage);

    await sendWA(
      chatId,
      `تم تأكيد الطلب ✅
المطبخ بدأ التحضير
الوقت المتوقع 30 - 45 دقيقة`
    );

    delete SESSIONS[chatId];

    return;
  }

  /* ================= الذكاء الاصطناعي ================= */

  try {

    const ai = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: SETTINGS.SYSTEM_PROMPT },
          ...session.history.slice(-6),
          { role: "user", content: userMessage }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${SETTINGS.OPENAI_KEY}`
        }
      }
    );

    let reply = ai.data.choices[0].message.content;

    /* ================= استخراج الطلب ================= */

    if (reply.includes("[KITCHEN_GO]")) {

      session.awaitingConfirmation = true;

      const kitchenInfo = reply.split("[KITCHEN_GO]")[1];

      session.pendingOrder.itemsString =
        kitchenInfo.match(/الطلب:? ([^\n]+)/)?.[1] ||
        session.pendingOrder.itemsString;

      session.pendingOrder.total =
        kitchenInfo.match(/المجموع:? ([0-9.]+)/)?.[1] ||
        session.pendingOrder.total;

      session.pendingOrder.name =
        kitchenInfo.match(/الاسم:? ([^\n]+)/)?.[1] ||
        session.pendingOrder.name;

      session.pendingOrder.address =
        kitchenInfo.match(/العنوان:? ([^\n]+)/)?.[1] ||
        session.pendingOrder.address;

      await sendWA(
        chatId,
        `${reply.split("[KITCHEN_GO]")[0]}

هل الطلب صحيح؟

اكتب *تم* للتأكيد ✅`
      );

    } else {

      await sendWA(chatId, reply);

    }

    session.history.push({
      role: "user",
      content: userMessage
    });

    session.history.push({
      role: "assistant",
      content: reply
    });

  } catch (err) {

    console.log(err.message);

    await sendWA(
      chatId,
      "صار ضغط رسائل بسيط 🙏 جرب بعد ثواني"
    );
  }
});

/* ================= تشغيل السيرفر ================= */

app.listen(3000, () => {
  console.log("🤖 البوت جاهز للعمل");
});
