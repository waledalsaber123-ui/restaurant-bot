import express from "express";
import { sendMessage } from "./whatsapp.js"; // تأكد أن whatsapp.js فيه export لدالة sendMessage

const app = express();
app.use(express.json());

// خريطة لتخزين حالة كل مستخدم (هل هو في القائمة أم مع موظف)
const userState = new Map();

async function handleMessage(chatId, text) {
  const msg = String(text || "").trim();
  if (!msg) return;

  // إذا أرسل المستخدم 0 في أي وقت، نعيده للقائمة الرئيسية
  if (msg === "0") {
    userState.set(chatId, "MENU");
    return sendMessage(chatId, "✅ تم العودة للقائمة الرئيسية.\n\n1️⃣ للاتصال\n2️⃣ للمحادثة\n3️⃣ للموقع");
  }

  // إذا كان المستخدم يتحدث مع موظف، نتجاهل الرسالة (لا يرد البوت)
  if (userState.get(chatId) === "HUMAN_SUPPORT") {
    return; 
  }

  // القائمة الترحيبية الاحترافية (تظهر أول مرة)
  if (!userState.has(chatId) || userState.get(chatId) === "START") {
    userState.set(chatId, "MENU");
    return sendMessage(
      chatId,
`مرحباً بك في خدمة العملاء 🤖 ✨

يسعدنا خدمتك، يرجى اختيار الرقم المناسب:

1️⃣ | رقم السنتر والاتصال
2️⃣ | التحدث مع الموظف (محادثة)
3️⃣ | عنواننا وموقعنا الجغرافي

شكراً لتواصلك معنا! 🙏`
    );
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return sendMessage(chatId, "📞 *قسم المبيعات والاتصال*\n\nيرجى التواصل على الرقم:\n0796893403");
    }

    if (msg === "2") {
      userState.set(chatId, "HUMAN_SUPPORT");
      return sendMessage(chatId, "🤝 *تحويل للموظف*\n\nتم تحويلك للموظف، سيتم الرد عليك قريباً.\n(أرسل 0 للعودة للبوت)");
    }

    if (msg === "3") {
      return sendMessage(chatId, "📍 *موقعنا*\n\nعمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.\n\n🗺️ الخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98");
    }

    // إذا أرسل رقماً غير موجود في القائمة
    return sendMessage(chatId, "⚠️ عذراً، يرجى اختيار رقم من القائمة (1 أو 2 أو 3).\nأرسل 0 للبدء من جديد.");
  }
}

// الروابط الأساسية للسيرفر
app.get("/", (req, res) => res.send("SERVER RUNNING OK ✅"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const webhookType = body?.typeWebhook;
    if (webhookType !== "incomingMessageReceived") return;

    const chatId = body?.senderData?.chatId;
    const text = body?.messageData?.textMessageData?.textMessage || 
                 body?.messageData?.extendedTextMessageData?.text || "";

    if (chatId && text) {
      await handleMessage(chatId, text);
    }
  } catch (error) {
    console.error("WEBHOOK ERROR:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER IS ACTIVE ON PORT", PORT));
