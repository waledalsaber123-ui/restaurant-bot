import axios from "axios";
import { CONFIG } from "./config.js";

const messageQueue = [];
let isProcessingQueue = false;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// دالة لمحاكاة وقت الكتابة بناءً على طول النص
const waitTyping = async (text) => {
    if(!text) return;
    // 50 ملي ثانية لكل حرف + ثانية عشوائية
    const typingTime = (text.length * 50) + (Math.random() * 1000 + 500); 
    await delay(Math.min(typingTime, 5000)); // كحد أقصى 5 ثوانٍ
};

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { chatId, text, resolve, reject } = messageQueue.shift();
        try {
            const baseUrl = `https://7103.api.greenapi.com/waInstance${CONFIG.ID_INSTANCE}`;
            
            // 1. إظهار أن البوت "متصل"
            await axios.post(`${baseUrl}/setPresence/${CONFIG.GREEN_TOKEN}`, { chatId, presence: 'online' });
            
            // 2. إظهار "جاري الكتابة"
            await axios.post(`${baseUrl}/setPresence/${CONFIG.GREEN_TOKEN}`, { chatId, presence: 'composing' });
            
            // 3. انتظار وقت الكتابة
            await waitTyping(text);

            // 4. إرسال الرسالة
            await axios.post(`${baseUrl}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId, message: text });

            console.log(`✅ WA Sent: ${chatId}`);
            resolve();
        } catch (err) {
            console.error("❌ Error WA:", err.message);
            reject(err);
        }
        
        // فاصل زمني بين كل محادثة وأخرى (بين 2 إلى 4 ثوانٍ)
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
