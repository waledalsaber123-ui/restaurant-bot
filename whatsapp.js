import axios from "axios";
import { CONFIG } from "./config.js";

const messageQueue = [];
let isProcessingQueue = false;

// 🧠 تخزين آخر الرسائل لمنع التكرار
const sentCache = new Map(); // key: chatId+text

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { chatId, text, resolve, reject } = messageQueue.shift();

        try {
            const idInstance = String(CONFIG.ID_INSTANCE).trim();
            const apiToken = String(CONFIG.GREEN_TOKEN).trim();

            // 🔒 منع إرسال نفس الرسالة لنفس الشخص خلال 10 ثواني
            const key = chatId + "_" + text;
            const now = Date.now();

            if (sentCache.has(key)) {
                const lastTime = sentCache.get(key);
                if (now - lastTime < 10000) {
                    console.log("⚠️ Duplicate prevented");
                    resolve();
                    continue;
                }
            }

            sentCache.set(key, now);

            const url = \`https://7103.api.greenapi.com/waInstance\${idInstance}/sendMessage/\${apiToken}\`;

            console.log(\`🚀 Sending → \${chatId}\`);

            const response = await axios.post(url, {
                chatId: chatId,
                message: text
            });

            if (response.data?.idMessage) {
                console.log("✅ Sent");
                resolve();
            }

        } catch (err) {
            console.error("❌ ERROR:");

            if (err.response?.data) {
                console.error(err.response.data);
            } else {
                console.error(err.message);
            }

            reject(err);
        }

        // 🔥 تأخير ذكي (2.5 - 4 ثواني عشوائي لتجنب الحظر)
        await delay(2500 + Math.random() * 1500);
    }

    isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {

        // 🛑 فلتر إضافي: منع نص فاضي
        if (!text || text.trim() === "") {
            return resolve();
        }

        messageQueue.push({ chatId, text, resolve, reject });
        processQueue();
    });
}
