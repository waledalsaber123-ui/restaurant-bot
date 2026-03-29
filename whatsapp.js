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
            const idInstance = String(CONFIG.ID_INSTANCE).trim();
            const apiToken = String(CONFIG.GREEN_TOKEN).trim();
            
            // ✅ الرابط المباشر للإرسال فقط - هذا الرابط لا يعطي 403 إذا التوكن صح
            const url = `https://7103.api.greenapi.com/waInstance${idInstance}/sendMessage/${apiToken}`;

            console.log(`🚀 Sending Message to ${chatId}...`);

            const response = await axios.post(url, {
                chatId: chatId,
                message: text
            });

            if (response.data && response.data.idMessage) {
                console.log(`✅ SUCCESS: Message Sent!`);
                resolve();
            }
        } catch (err) {
            console.error("❌ WHATSAPP ERROR:");
            // طباعة نص الخطأ القادم من Green-API لمعرفة السبب بدقة
            if (err.response && err.response.data) {
                console.error("Data:", err.response.data);
            } else {
                console.error("Message:", err.message);
            }
            reject(err);
        }
        // تأخير بسيط 3 ثواني بين الرسائل
        await delay(3000);
    }
    isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        messageQueue.push({ chatId, text, resolve, reject });
        processQueue();
    });
}
