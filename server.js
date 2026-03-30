// دالة لتحويل الأرقام العربية والفارسية إلى أرقام إنجليزية
function replaceArabicNums(str) {
  return str.replace(/[٠-٩]/g, function(d) {
    return d.charCodeAt(0) - 1632;
  }).replace(/[۰-۹]/g, function(d) {
    return d.charCodeAt(0) - 1776;
  });
}

async function handleMessage(chatId, text) {
  // 1. تنظيف النص وتحويل الأرقام العربية لإنجليزية
  let msg = String(text || "").trim();
  msg = replaceArabicNums(msg); 

  if (!msg) return;

  // خيار العودة (0 أو ٠)
  if (msg === "0") {
    userState.set(chatId, "MENU");
    return sendMessage(chatId, "✅ تم العودة للقائمة الرئيسية لمطعم صابر جو سناك.");
  }

  // إذا كان العميل مع الموظف
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
      return sendMessage(chatId, "📞 *مطعم صابر جو سناك - قسم الطلبات*\n\nيرجى الاتصال على الرقم:\n0796893403\n\nصحتين وعافية مسبقاً! 🌮");
    }

    if (msg === "2") {
      userState.set(chatId, "HUMAN_SUPPORT");
      return sendMessage(chatId, "🤝 *تحويل للموظف - صابر جو سناك*\n\nتم تحويلك للموظف، سنسعد بخدمتك قريباً.\n(أرسل 0 للعودة للبوت الآلي)");
    }

    if (msg === "3") {
      const address = `📍 *عنوان مطعم صابر جو سناك*
      
عمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.

🗺️ رابط الموقع على الخريطة:
https://maps.app.goo.gl/Arfm7MYTskFqezj98`;
      return sendMessage(chatId, address);
    }

    // رد في حال إدخال خاطئ
    return sendMessage(chatId, "⚠️ يرجى اختيار (1، 2، أو 3) لخدمتك في مطعم صابر جو سناك.");
  }
}
