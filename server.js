import express from "express";
import { sendMessage } from "./whatsapp.js";

const app = express();
app.use(express.json());

const userState = new Map();

// دالة سحرية لتحويل الأرقام (١، ٢، ٣) إلى (1, 2, 3) فوراً
function replaceArabicNums(str) {
  if (!str) return "";
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)])
            .replace(/[۰-۹]/g, d => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]);
}

async function handleMessage(chatId, text) {
  // 1. تنظيف النص وتحويل الأرقام العربية إلى إنجليزية
  let rawMsg = String(text || "").trim();
  let msg = replaceArabicNums(rawMsg); 

  if (!msg) return;

  // خيار العودة (0) في أي وقت
  if (msg === "0") {
    userState.set(chatId, "MENU");
    return sendMessage(chatId, "✅ تم العودة للقائمة الرئيسية لمطعم صابر جو سناك.");
  }

  // إذا كان الزبون مع الموظف، البوت يصمت
  if (userState.get(chatId) === "HUMAN_SUPPORT") return;

  // 2. القائمة الترحيبية باسم "مطعم صابر جو سناك"
  if (!userState.has(chatId) || userState.get(chatId) === "START") {
    userState.set(chatId, "MENU");
    const welcome = `
أهلاً بك في مطعم صابر جو سناك 🍔🍟 ✨
يسعدنا خدمتك، يرجى اختيار الرقم المناسب:

1️⃣  | للطلب السريع والاتصال بالسنتر
2️⃣  | للتحدث مع موظف (محادثة مباشرة)
3️⃣  | عنوان المطعم وموقعنا الجغرافي

شكراً لاختيارك صابر جو سناك! ❤️`;
    return sendMessage(chatId, welcome);
  }

  const state = userState.get(chatId);

  if (state === "MENU") {
    if (msg === "1") {
      return sendMessage(chatId, "📞 *مطعم صابر جو سناك - الطلبات*\n\nيرجى الاتصال على الرقم:\n0796893403\n\nصحتين وعافية مسبقاً! 🌮");
    }

    if (msg === "2") {
      userState.set(chatId, "HUMAN_SUPPORT");
      return sendMessage(chatId, "🤝 *صابر جو سناك - محادثة مباشرة*\n\nتم تحويلك للموظف، سنسعد بخدمتك قريباً.\n(أرسل 0 للعودة للرد الآلي)");
    }

    if (msg === "3") {
      const address = `📍 *عنوان مطعم صابر جو سناك*
      
عمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.

🗺️ رابط الموقع على الخريطة:
https://maps.app.goo.gl/Arfm7MYTskFqezj98`;
      return sendMessage(chatId, address);
    }

    // إذا أدخل رقماً غير موجود
    return sendMessage(chatId, "⚠️ يرجى اختيار (1، 2، أو 3) لخدمتك في مطعم صابر جو سناك.");
  }
}

app.get("/", (req, res) => res.send("Saber Go Snack Server OK ✅"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const webhookType = body?.typeWebhook;
    if (webhookType && webhookType !== "incomingMessageReceived") return;

    const chatId = body?.senderData?.chatId;
    const text = body?.messageData?.textMessageData?.textMessage || 
                 body?.messageData?.extendedTextMessageData?.text || "";

    if (chatId && text) {
      await handleMessage(chatId, text);
    }
  } catch (error) {
    console.error("ERROR:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SABER GO SNACK SERVER ACTIVE ON PORT", PORT));
