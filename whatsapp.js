import axios from 'axios';
import { CONFIG } from './config.js';

let activeSupportChats = [];

// الدالة التي يطلبها ملف server.js
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

    if (activeSupportChats.includes(chatId)) {
        if (userMessage === "0") {
            activeSupportChats = activeSupportChats.filter(id => id !== chatId);
            await sendMessage(chatId, "✅ تم تفعيل الرد الآلي مجدداً. كيف يمكنني مساعدتك؟");
        }
        return; 
    }

    if (userMessage === '1') {
        await sendMessage(chatId, "📞 *قسم المبيعات والاتصال*\n\nيرجى التواصل معنا مباشرة على الرقم التالي:\n0796893403\n\nنحن بانتظارك!");
    } 
    else if (userMessage === '2') {
        activeSupportChats.push(chatId);
        await sendMessage(chatId, "🤝 *تحويل للموظف*\n\nتم إرسال طلبك للموظف المختص. سيتم الرد عليك في أقرب وقت ممكن.\n\n_(ملاحظة: للعودة للبوت الآلي أرسل رقم 0)_");
    }
    else if (userMessage === '3') {
        await sendMessage(chatId, "📍 *موقعنا وفرعنا*\n\nيمكنك زيارتنا في موقعنا الرسمي من خلال الرابط التالي:\n[أدخل رابط الموقع هنا]");
    }
    else {
        const welcomeMenu = `
مرحباً بك في خدمة العملاء 🤖 ✨

من فضلك اختر الرقم المناسب لخدمتك:

1️⃣  | للحصول على رقم السنتر والاتصال
2️⃣  | للتحدث مع الموظف مباشرة
3️⃣  | موقعنا ومعلومات إضافية

نشكر تواصلك معنا!`;
        await sendMessage(chatId, welcomeMenu);
    }
});
