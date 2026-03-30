// مصفوفة لتخزين معرفات (IDs) مستخدمي فيسبوك الذين يتحدثون مع موظف
let fbActiveSupport = [];

// دالة استقبال الرسائل في فيسبوك
client.on('message', async (msg) => {
    const senderId = msg.sender.id; // معرف الشخص المرسل على مسنجر
    const userMessage = msg.message.text ? msg.message.text.trim() : "";

    // 1. التحقق إذا كان الزبون في وضع "المحادثة البشرية"
    if (fbActiveSupport.includes(senderId)) {
        // إذا كتب الزبون "رجوع" يعود البوت للرد
        if (userMessage === "رجوع") {
            fbActiveSupport = fbActiveSupport.filter(id => id !== senderId);
            await client.sendTextMessage(senderId, "تم تفعيل الرد الآلي مجدداً. كيف يمكنني مساعدتك؟");
        }
        return; // البوت يصمت هنا ليعطي المجال للموظف
    }

    // 2. منطق الردود بناءً على طلبك
    if (userMessage === "1") {
        await client.sendTextMessage(senderId, "📞 للاتصال بنا، يرجى التواصل مع السنتر على الرقم التالي: \n0796893403");
    } 
    
    else if (userMessage === "2") {
        // إضافة الزبون لقائمة الإيقاف المؤقت للبوت
        fbActiveSupport.push(senderId);
        
        await client.sendTextMessage(senderId, "💬 تم تحويلك للمحادثة المباشرة مع الموظف. يرجى الانتظار قليلاً.");
        console.log(`[Facebook] زبون جديد (ID: ${senderId}) يطلب موظف.`);
    } 
    
    else {
        // القائمة الترحيبية على المسنجر
        const welcomeMenu = "مرحباً بك في صفحتنا 🤖\n\n" +
                            "اضغط [ 1 ] : لرقم السنتر والاتصال\n" +
                            "اضغط [ 2 ] : للتحدث مع الموظف مباشرة";
        await client.sendTextMessage(senderId, welcomeMenu);
    }
});
