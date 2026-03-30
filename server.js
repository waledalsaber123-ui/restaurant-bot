import express from "express";
import { sendMessage } from "./whatsapp.js";

const app = express();
app.use(express.json());

const userState = new Map();

// دالة تحويل الأرقام لضمان عمل (١، ٢، ٣)
function fixNumbers(str) {
  if (!str) return "";
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

async function handleMessage(chatId, text, platform = "WHATSAPP") {
  // 1. فحص إذا كانت الرسالة من جروب (في واتساب الجروبات تنتهي بـ @g.us)
  if (platform === "WHATSAPP" && chatId.includes("@g.us")) {
    console.log("🚫 رسالة من مجموعة.. تم التجاهل.");
    return; 
  }

  let msg = fixNumbers(String(text).trim());
  if (!msg) return;

  // خيار العودة
  if (msg === "0") {
    userState.set(chatId, "MENU");
    return sendMessage(chatId, "✅ تم العودة للقائمة الرئيسية لمطعم صابر جو سناك.");
  }

  // إذا كان العميل مع الموظف (للواتساب فقط)
  if (platform === "WHATSAPP" && userState.get(chatId) === "HUMAN_SUPPORT") return;

  // 2. القائمة الترحيبية
  if (!userState.has(chatId) || userState.get(chatId) === "START") {
    userState.set(chatId, "MENU");
    const welcome = `أهلاً بك في مطعم صابر جو سناك 🍔 ✨\n\n1️⃣ | للطلب والاتصال بالسنتر\n2️⃣ | للتحدث مع الموظف مباشره\n3️⃣ | عنواننا وموقعنا الجغرافي\n\nشكراً لتواصلك معنا! ❤️`;
    return sendMessage(chatId, welcome);
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return sendMessage(chatId, "📞 *صابر جو سناك*\nلطلب الوجبات، اتصل بنا على:\n0796893403");
    }

    if (msg === "2") {
      if (platform === "FACEBOOK") {
        // تحويل زبون المسنجر لرابط الواتساب الجديد الذي أرسلته
        const waLink = "https://api.whatsapp.com/message/VOYIS2EQZEGLA1";
        return sendMessage(chatId, `🤝 *صابر جو سناك*\n\nللرد السريع، يرجى مراسلتنا عبر الواتساب مباشرة من هنا:\n${waLink}`, "FACEBOOK");
      } else {
        userState.set(chatId, "HUMAN_SUPPORT");
        return sendMessage(chatId, "🤝 *صابر جو سناك*\nتم تحويلك للموظف، سيتم الرد عليك قريباً.\n(أرسل 0 للعودة للرد الآلي)");
      }
    }

    if (msg === "3") {
      return sendMessage(chatId, "📍 *عنوان مطعم صابر جو سناك*\nعمان - شارع الجامعة - طلوع هافانا.\n🗺️ الخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98");
    }

    return sendMessage(chatId, "⚠️ يرجى اختيار (1، 2، أو 3) لخدمتك في صابر جو سناك.");
  }
}

// --- الـ Webhook (استقبال الرسائل) ---
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    // التحقق من نوع الرسالة (رسالة قادمة)
    if (body?.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body?.senderData?.chatId;
    const text = body?.messageData?.textMessageData?.textMessage || 
                 body?.messageData?.extendedTextMessageData?.text || "";

    if (chatId && text) {
      await handleMessage(chatId, text, "WHATSAPP");
    }
  } catch (error) {
    console.error("ERROR:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SABER JO SNACK BOT IS ACTIVE! ✅"));
