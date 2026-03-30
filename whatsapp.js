import axios from 'axios';
import { CONFIG } from './config.js';

// دالة لتحويل الأرقام (١، ٢، ٣) إلى (1, 2, 3) لضمان الاستجابة
function replaceArabicNums(str) {
    return str.replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632)
              .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
}

// تصدير الدالة التي يستخدمها السيرفر للإرسال
export const sendMessage = async (chatId, text) => {
    try {
        await axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, {
            chatId: chatId,
            message: text
        });
    } catch (error) {
        console.error("❌ Error in WhatsApp Send:", error.message);
    }
};

// ملاحظة: معالجة الرسائل تتم في server.js باستخدام sendMessage المصدرة هنا
