let fbActiveSupport = [];

client.on('message', async (msg) => {
    const senderId = msg.sender.id;
    const userMessage = msg.message.text ? msg.message.text.trim() : "";

    if (fbActiveSupport.includes(senderId)) {
        if (userMessage === "0") {
            fbActiveSupport = fbActiveSupport.filter(id => id !== senderId);
            await client.sendTextMessage(senderId, "✅ تم تفعيل الرد الآلي مجدداً.");
        }
        return;
    }

    if (userMessage === "1") {
        await client.sendTextMessage(senderId, "📞 رقم السنتر للاتصال المباشر: 0796893403");
    } 
    else if (userMessage === "2") {
        fbActiveSupport.push(senderId);
        await client.sendTextMessage(senderId, "💬 تم تحويلك للموظف. سيتحدث معك قريباً.\n(أرسل 0 للعودة للرد الآلي)");
    } 
    else if (userMessage === "3") {
        const address = "📍 عنواننا: عمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.\n\nالخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98";
        await client.sendTextMessage(senderId, address);
    }
    else {
        const welcomeMenu = "أهلاً بك في مسنجر 🤖\n\n1️⃣ الاتصال بالسنتر\n2️⃣ التحدث مع موظف\n3️⃣ موقعنا وعنواننا";
        await client.sendTextMessage(senderId, welcomeMenu);
    }
});
