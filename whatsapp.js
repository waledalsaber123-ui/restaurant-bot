import axios from 'axios';
import { CONFIG } from './config.js';

// قائمة لتخزين العملاء الذين يحتاجون لموظف (مؤقتة في الذاكرة)
let activeSupportChats = new Map();

// الدالة الأساسية لإرسال الرسائل
export const sendMessage = async (chatId, text) => {
    try {
        await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, {
            chatId: chatId,
            message: text
        });
    } catch (error) {
        console.error("❌ Error in WhatsApp SendMessage:", error.response ? error.response.data : error.message);
    }
};

// الدالة التي تعالج الردود الآلية والقائمة (سيتم استدعاؤها من server.js)
export const handleWhatsAppMenu = async (chatId, userMessage) => {
    const msg = userMessage.trim();

    // 1. التحقق من حالة الموظف
    if (activeSupportChats.has(chatId)) {
        if (msg === "0") {
            activeSupportChats.delete(chatId);
            await sendMessage(chatId, "✅ تم تفعيل الرد الآلي مجدداً.");
        }
        return; // توقف عن الرد الآلي
    }

    // 2. القائمة الرئيسية
    if (msg === "1") {
        await sendMessage(chatId, "📞 *قسم المبيعات والاتصال المباشر*\n\n0796893403");
    } 
    else if (msg === "2") {
        activeSupportChats.set(chatId, true);
        await sendMessage(chatId, "🤝 *تحويل للموظف المختص*\n\nيرجى الانتظار.. (أرسل 0 للعودة للبوت)");
    } 
    else if (msg === "3") {
        await sendMessage(chatId, "📍 *موقعنا*\n\nعمان - شارع الجامعة الأردنية - طلوع هافانا - عند الدوريات الخارجية.\n\n🗺️ الخريطة: https://maps.app.goo.gl/Arfm7MYTskFqezj98");
    } 
    else {
        const menu = `مرحباً بك 🤖\n\n1️⃣ للاتصال\n2️⃣ للمحادثة\n3️⃣ للموقع`;
        await sendMessage(chatId, menu);
    }
};
