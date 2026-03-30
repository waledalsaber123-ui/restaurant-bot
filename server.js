async function handleMessage(chatId, text, platform = "WHATSAPP") {
  // 1. تجاهل الجروبات أولاً
  if (platform === "WHATSAPP" && chatId.includes("@g.us")) return;

  // 2. تنظيف النص وتحويل الأرقام
  let rawText = String(text).trim();
  let msg = fixNumbers(rawText);

  // 3. الحماية القصوى: إذا كان العميل مسجلاً "تحدث مع موظف"
  // البوت سيتجاهل أي رسالة إلا إذا كانت "0" للعودة
  if (userState.get(chatId) === "HUMAN_SUPPORT") {
    if (msg === "0") {
      userState.set(chatId, "MENU");
      const backMsg = "✅ تم العودة للقائمة الآلية لمطعم صابر جو سناك. كيف يمكنني مساعدتك؟";
      return platform === "WHATSAPP" ? sendWhatsApp(chatId, backMsg) : sendFBMessage(chatId, backMsg);
    }
    console.log(`[صمت البوت] العميل ${chatId} يتحدث مع الموظف الآن.`);
    return; // الخروج من الدالة فوراً دون أي رد
  }

  // 4. القائمة الترحيبية (إذا كانت أول مرة)
  if (!userState.has(chatId) || userState.get(chatId) === "START") {
    userState.set(chatId, "MENU");
    const welcome = `أهلاً بك في مطعم صابر جو سناك 🍔 ✨\n\n1️⃣ | للطلب والاتصال بالسنتر\n2️⃣ | للتحدث مع الموظف مباشره\n3️⃣ | عنواننا وموقعنا الجغرافي\n\nشكراً لتواصلك معنا! ❤️`;
    return platform === "WHATSAPP" ? sendWhatsApp(chatId, welcome) : sendFBMessage(chatId, welcome);
  }

  const state = userState.get(chatId);

  // 5. منطق القائمة
  if (state === "MENU") {
    if (msg === "1") {
      return platform === "WHATSAPP" 
        ? sendWhatsApp(chatId, "📞 *صابر جو سناك*\nلطلب الوجبات: 0796893403") 
        : sendFBMessage(chatId, "📞 *صابر جو سناك*\nرقم الطلبات: 0796893403");
    }

    if (msg === "2") {
      // تفعيل وضع "الموظف" فوراً
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
    
    // إذا أرسل أي شيء آخر وهو في المنيو
    const retry = "⚠️ يرجى اختيار (1 أو 2 أو 3) لخدمتك في صابر جو سناك.";
    return platform === "WHATSAPP" ? sendWhatsApp(chatId, retry) : sendFBMessage(chatId, retry);
  }
}
