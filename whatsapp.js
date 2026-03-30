// مصفوفة لتخزين أرقام العملاء الذين يتحدثون مع موظف حالياً
// لكي لا يزعجهم البوت بالردود الآلية
let activeSupportChats = [];

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const userMessage = msg.body.trim();
    const userNumber = msg.from; // معرف العميل (رقم هاتفه)

    // 1. التحقق إذا كان العميل في حالة "محادثة مع موظف"
    if (activeSupportChats.includes(userNumber)) {
        // إذا أرسل العميل كلمة "إنهاء" يمكننا إعادة تفعيل البوت له
        if (userMessage === "إنهاء") {
            activeSupportChats = activeSupportChats.filter(id => id !== userNumber);
            await msg.reply("تم إنهاء المحادثة مع الموظف. البوت الآلي متاح لخدمتك الآن.");
        }
        return; // الخروج من الدالة وعدم قيام البوت بأي رد آلي
    }

    // 2. منطق القائمة الرئيسية
    if (userMessage === '1') {
        await msg.reply('📞 للاتصال بنا، يرجى التواصل مع السنتر على الرقم التالي: \n0796893403');
    } 
    
    else if (userMessage === '2') {
        // إضافة العميل لقائمة "المحادثة المباشرة" ليتوقف البوت عن الرد عليه
        activeSupportChats.push(userNumber);
        
        await msg.reply('💬 تم تحويلك للمحادثة المباشرة. سيقوم الموظف بالرد عليك قريباً.\n\n*(ملاحظة: البوت سيتوقف عن الرد التلقائي الآن)*');
        
        // هنا يمكنك إرسال إشعار لنفسك أو للموظف بأن هناك عميل ينتظر
        console.log(`العميل ${userNumber} طلب التحدث مع موظف.`);
    } 
    
    else {
        // الرسالة الترحيبية الافتراضية
        const welcomeMenu = `
مرحباً بك في خدمة العملاء 🤖
من فضلك اختر من القائمة التالية:

اضغط [ 1 ] : للحصول على رقم السنتر للاتصال.
اضغط [ 2 ] : للتحدث مع أحد موظفينا.
        `;
        await msg.reply(welcomeMenu);
    }
});
