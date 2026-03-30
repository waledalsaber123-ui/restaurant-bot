import axios from 'axios';
import { CONFIG } from './config.js';

// دالة الإرسال التي يستخدمها السيرفر
export const sendMessage = async (chatId, text) => {
    try {
        await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, {
            chatId: chatId,
            message: text
        });
        console.log(`✅ تم إرسال رسالة من صابر جو سناك إلى: ${chatId}`);
    } catch (error) {
        console.error("❌ خطأ في إرسال واتساب:", error.message);
    }
};
