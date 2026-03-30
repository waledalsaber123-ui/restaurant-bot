let fbActiveSupport = [];

// دالة تحويل الأرقام (٠، ١، ٢، ٣) إلى (0, 1, 2, 3)
function fixNumbers(str) {
    return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

client.on('message', async (msg) => {
    const senderId = msg.sender.id;
    let text = msg.message.text ? msg.message.text.trim() : "";
    
    // تحويل الأرقام العربية فوراً
    const userMsg = fixNumbers(text);

    // 1. نظام الموظف (إيقاف البوت)
    if (fbActiveSupport.includes(senderId)) {
        if (userMsg === "0") {
            fbActiveSupport = fbActiveSupport.filter(id => id !== senderId);
            await client.sendTextMessage(senderId, "✅ تم تفعيل الرد الآلي لمطعم صابر جو سناك.");
        }
        return; 
    }

    // 2. القائمة الرئيسية لمطعم صابر جو سناك
    if (userMsg === "1") {
        await client.sendTextMessage(senderId, "📞 *مطعم صابر جو سناك*\n\nرقم الطلبات والاتصال:\n0796893403\n\nننتظر طلبك! 🍔");
    } 
    else if (userMsg === "2") {
        fbActiveSupport.push(senderId);
        await client.sendTextMessage(senderId, "🤝 *صابر جو سناك - محادثة مباشرة*\n\nتم تحويلك للموظف المختص. (أرسل 0 للعودة للبوت)");
    } 
    else if (userMsg === "3") {
        const address = "📍 *عنوان مطعم صابر جو سناك*\n\nعمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.\n\nالخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98";
        await client.sendTextMessage(senderId, address);
    }
    else {
        // الرسالة الترحيبية الشاملة
        const welcome = `أهلاً بك في مطعم صابر جو سناك 🍔🍟 ✨

1️⃣ | للطلب والاتصال بالسنتر
2️⃣ | للتحدث مع موظف (محادثة)
3️⃣ | عنواننا وموقعنا الجغرافي

شكراً لتواصلك معنا! ❤️`;
        await client.sendTextMessage(senderId, welcome);
    }
});
