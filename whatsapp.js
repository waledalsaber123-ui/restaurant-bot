import axios from "axios";
import { CONFIG } from "./config.js";

const messageQueue = [];
let isProcessingQueue = false;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { chatId, text, resolve, reject } = messageQueue.shift();
        try {
            // الرابط المباشر من الـ Logs تبعتك
            const idInstance = "7103566520"; 
            const apiToken = CONFIG.GREEN_TOKEN.trim(); // تنظيف التوكن من أي فراغات
            const baseUrl = `https://7103.api.greenapi.com/waInstance${idInstance}`;

            // محاولة إرسال الرسالة فقط (بدون Presence لتجاوز خطأ 403 مؤقتاً)
            const response = await axios.post(`${baseUrl}/sendMessage/${apiToken}`, {
                chatId: chatId,
                message: text
            });

            console.log(`✅ WhatsApp Sent! ID: ${response.data.idMessage}`);
            resolve();
        } catch (err) {
            console.error("❌ WhatsApp Error Status:", err.response?.status);
            console.error("❌ Details:", err.response?.data || err.message);
            reject(err);
        }
        await delay(3000); // تأخير 3 ثواني بين الرسائل للأمان
    }
    isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        messageQueue.push({ chatId, text, resolve, reject });
        processQueue();
    });
}
