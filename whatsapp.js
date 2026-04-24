import axios from 'axios';
import { CONFIG } from './config.js';

export async function sendWhatsAppMessage(chatId, message) {
    // نظام الحماية من الحظر: تأخير عشوائي بين 3 إلى 6 ثوانٍ
    const delay = Math.floor(Math.random() * 3000) + 3000; 
    await new Promise(resolve => setTimeout(resolve, delay));

    const url = `${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`;
    try {
        await axios.post(url, {
            chatId: chatId,
            message: message
        });
    } catch (error) {
        console.error(`WhatsApp Error (${chatId}):`, error.message);
    }
}
