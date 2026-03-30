import express from "express";
import axios from "axios";
import { sendMessage as sendWhatsApp } from "./whatsapp.js";

const app = express();
app.use(express.json());

// خريطة لتخزين حالة المستخدم (لمعرفة من يتحدث مع موظف)
const userState = new Map();

// دالة تحويل الأرقام (١، ٢، ٣) إلى (1, 2, 3)
function fixNumbers(str) {
  if (!str) return "";
  const arabicNums = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  let result = str;
  arabicNums.forEach((a, i) => {
    result = result.replace(new RegExp(a, 'g'), i);
  });
  return result;
}

// دالة معالجة الرسائل الموحدة لمطعم صابر جو سناك
async function handleMessage(chatId, text, platform = "WHATSAPP") {
  // 1. تجاهل الجروبات في واتساب
  if (platform === "WHATSAPP" && chatId.includes("@g.us")) return;

  let rawText = String(text).trim();
  let msg = fixNumbers(rawText);

  // 2. خيار العودة (0) لإعادة تفعيل البوت
  if (msg === "0") {
    userState.set(chatId, "MENU");
    const backMsg = "✅ تم العودة للقائمة الرئيسية لمطعم صابر جو سناك. البوت الآلي مفعّل الآن.";
    return platform === "WHATSAPP" ? sendWhatsApp(chatId, backMsg) : sendFBMessage(chatId, backMsg);
  }

  // 3. الفحص الحاسم: إذا كان المستخدم في حالة "تحدث مع موظف"، اخرج فوراً ولا ترد
  if (userState.get(chatId) === "HUMAN_SUPPORT") {
    console.log(`[${platform}] العميل ${chatId} في محادثة مع موظف.. البوت صامت.`);
    return; 
  }

  // 4. القائمة الترحيبية (أول مرة)
  if (!userState.has(chatId) || userState.get(chatId) === "START") {
    userState.set(chatId, "MENU");
    const welcome = `أهلاً بك في مطعم صابر جو سناك 🍔 ✨\n\n1️⃣ | للطلب والاتصال بالسنتر\n2️⃣ | للتحدث مع الموظف مباشره\n3️⃣ | عنواننا وموقعنا الجغرافي\n\nشكراً لتواصلك معنا! ❤️`;
    return platform === "WHATSAPP" ? sendWhatsApp(chatId, welcome) : sendFBMessage(chatId, welcome);
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return platform === "WHATSAPP" 
        ? sendWhatsApp(chatId, "📞 *صابر جو سناك*\nلطلب الوجبات: 0796893403") 
        : sendFBMessage(chatId, "📞 *صابر جو سناك*\nرقم الطلبات: 0796893403");
    }

    if (msg === "2") {
      // تفعيل حالة "الموظف" وإيقاف البوت لهذا الرقم
      userState.set(chatId, "HUMAN_SUPPORT");

      if (platform === "FACEBOOK") {
        const waLink = "https://api.whatsapp.com/message/VOYIS2EQZEGLA1";
        return sendFBMessage(chatId, `🤝 *صابر جو سناك*\n\nللرد السريع، يرجى مراسلتنا عبر الواتساب مباشرة من هنا:\n${waLink}\n\nنحن بانتظارك! 🍔`);
      } else {
        return sendWhatsApp(chatId, "🤝 *صابر جو سناك*\nتم تحويلك للموظف، سيتوقف البوت عن الرد الآن لخدمتك يدوياً.\n\n(أرسل 0 إذا أردت العودة للبوت الآلي)");
      }
    }

    if (msg === "3") {
      const loc = "📍 *عنوان مطعم صابر جو سناك*\nعمان - شارع الجامعة - طلوع هافانا.\n🗺️ الخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98";
      return platform === "WHATSAPP" ? sendWhatsApp(chatId, loc) : sendFBMessage(chatId, loc);
    }

    // رسالة تنبيه في حال إدخال خاطئ
    const retry = "⚠️ من فضلك اختر (1 أو 2 أو 3) لخدمتك في صابر جو سناك.";
    return platform === "WHATSAPP" ? sendWhatsApp(chatId, retry) : sendFBMessage(chatId, retry);
  }
}

// دالة إرسال رسائل المسنجر
async function sendFBMessage(recipientId, messageText) {
  try {
    const PAGE_ACCESS_TOKEN = process.env.PAGE_TOKEN;
    await axios.post(`https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: recipientId },
      message: { text: messageText },
    });
  } catch (error) {
    console.error("❌ Facebook Send Error:", error.response?.data || error.message);
  }
}

// الـ Webhooks
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body?.typeWebhook !== "incomingMessageReceived") return;
  const chatId = body?.senderData?.chatId;
  const text = body?.messageData?.textMessageData?.textMessage || 
               body?.messageData?.extendedTextMessageData?.text || "";
  if (chatId && text) await handleMessage(chatId, text, "WHATSAPP");
});

app.post("/facebook-webhook", async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      if (entry.messaging) {
        const ev = entry.messaging[0];
        const senderId = ev.sender.id;
        const text = ev.message?.text;
        if (text) handleMessage(senderId, text, "FACEBOOK");
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  }
});

app.get("/facebook-webhook", (req, res) => {
  if (req.query['hub.verify_token'] === "saber_snack_token") {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Saber Go Snack Bot Live on Port ${PORT}`));
