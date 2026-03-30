import axios from 'axios';
import { CONFIG } from './config.js';

let activeSupportChats = [];

// تصدير الدالة التي يطلبها ملف server.js لإصلاح الخطأ
export const sendMessage = async (chatId, text) => {
    try {
        await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, {
            chatId: chatId,
            message: text
        });
    } catch (error) {
        console.error("Error in WhatsApp SendMessage:", error.message);
    }
};

client.on('message', async (msg) => {
    const chatId = msg.from;
    const userMessage = msg.body ? msg.body.trim() : "";

    // منطق إيقاف البوت عند التحويل للموظف
    if (activeSupportChats.includes(chatId)) {
        if (userMessage === "0") {
            activeSupportChats = activeSupportChats.filter(id => id !== chatId);
            await sendMessage(chatId, "✅ تم تفعيل الرد الآلي مجدداً. كيف يمكنني مساعدتك؟");
        }
        return; 
    }

    // القائمة الرئيسية الاحترافية
    if (userMessage === '1') {
        await sendMessage(chatId, "📞 *قسم المبيعات والاتصال المباشر*\n\nيسعدنا تواصلك معنا على الرقم التالي:\n0796893403\n\nنحن بانتظار اتصالك! ✨");
    } 
    else if (userMessage === '2') {
        activeSupportChats.push(chatId);
        await sendMessage(chatId, "🤝 *تحويل للموظف المختص*\n\nتم إرسال طلبك بنجاح. سيقوم أحد موظفينا بالرد عليك خلال لحظات.\n\n_(ملاحظة: للعودة للبوت الآلي في أي وقت أرسل رقم 0)_");
    }
    else if (userMessage === '3') {
        const locationMsg = `📍 *موقعنا وفرعنا الرئيسي*

عمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.

🗺️ لمشاهدة الموقع على الخريطة:
https://maps.app.goo.gl/Arfm7MYTskFqezj98`;
        
        await sendMessage(chatId, locationMsg);
    }
    else {
        // الرسالة الترحيبية المنسقة
        const welcomeMenu = `
مرحباً بك في خدمة العملاء 🤖 ✨

يسعدنا خدمتك، يرجى اختيار الرقم المناسب:

1️⃣  | للحصول على رقم السنتر والاتصال
2️⃣  | للتحدث مع الموظف مباشرة (محادثة)
3️⃣  | موقعنا الجغرافي (العنوان)

شكراً لتواصلك معنا! 🙏`;
        await sendMessage(chatId, welcomeMenu);
    }
});
