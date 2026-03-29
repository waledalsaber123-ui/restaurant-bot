import axios from "axios";
import { CONFIG } from "./config.js";

const messageQueue = [];
let isProcessingQueue = false;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const waitTyping = async (text) => {
    if(!text) return;
    const typingTime = (text.length * 50) + (Math.random() * 1000 + 500); 
    await delay(Math.min(typingTime, 5000));
};

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { chatId, text, resolve, reject } = messageQueue.shift();
        try {
            // ✅ التعديل هنا: استخدمنا CONFIG.API_URL مباشرة
            const baseUrl = CONFIG.API_URL; 
            const token = CONFIG.GREEN_TOKEN;
            
            // 1. إظهار متصل
            await axios.post(`${baseUrl}/setPresence/${token}`, { chatId, presence: 'online' });
            
            // 2. إظهار جاري الكتابة
            await axios.post(`${baseUrl}/setPresence/${token}`, { chatId, presence: 'composing' });
            
            // 3. انتظار
            await waitTyping(text);

            // 4. إرسال الرسالة
            await axios.post(`${baseUrl}/sendMessage/${token}`, { chatId, message: text });

            console.log(`✅ WhatsApp Sent to: ${chatId}`);
            resolve();
        } catch (err) {
            console.error("❌ WhatsApp Error:", err.response?.data || err.message);
            reject(err);
        }
        
        await delay(Math.floor(Math.random() * 2000) + 2000);
    }
    isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        messageQueue.push({ chatId, text, resolve, reject });
        processQueue();
    });
}
