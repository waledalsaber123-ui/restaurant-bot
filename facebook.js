let fbActiveSupport = [];

// دالة تحويل الأرقام لضمان عملها على المسنجر أيضاً
function replaceArabicNums(str) {
    return str.replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632)
              .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
}

client.on('message', async (msg) => {
    const senderId = msg.sender.id;
    let userMessage = msg.message.text ? msg.message.text.trim() : "";
    
    // تحويل الأرقام العربية لإنجليزية
    userMessage = replaceArabicNums(userMessage);

    // 1. إذا كان الزبون يتحدث مع موظف
    if (fbActiveSupport.includes(senderId)) {
        if (userMessage === "0") {
            fbActiveSupport = fbActiveSupport.filter(id => id !== senderId);
            await client.sendTextMessage(senderId, "✅ تم تفعيل الرد الآلي لمطعم صابر جو سناك مجدداً.");
        }
        return; 
    }

    // 2. منطق القائمة الاحترافية لمطعم صابر جو سناك
    if (userMessage === "1") {
        await client.sendTextMessage(senderId, "📞 *مطعم صابر جو سناك*\n\nيرجى الاتصال على الرقم التالي للطلبات:\n0796893403");
    } 
    else if (userMessage === "2") {
        fbActiveSupport.push(senderId);
        await client.sendTextMessage(senderId, "🤝 *صابر جو سناك - محادثة مباشرة*\n\nتم تحويلك للموظف، سنسعد بخدمتك قريباً.\n(أرسل 0 للعودة للرد الآلي)");
    } 
    else if (userMessage === "3") {
        const address = `📍 *عنوان مطعم صابر جو سناك*
عمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.
🗺️ الخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98`;
        await client.sendTextMessage(senderId, address);
    }
    else {
        const welcomeMenu = `أهلاً بك في مطعم صابر جو سناك 🍔 ✨

1️⃣ | للطلب السريع والاتصال
2️⃣ | للتحدث مع موظف (محادثة)
3️⃣ | عنواننا وموقعنا الجغرافي

شكراً لاختيارك صابر جو سناك! ❤️`;
        await client.sendTextMessage(senderId, welcomeMenu);
    }
});
