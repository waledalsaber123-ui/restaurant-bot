import axios from "axios";
import { CONFIG } from "./config.js";

// نظام الطابور لمنع الحظر
const messageQueue = [];
let isProcessingQueue = false;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const waitTyping = async (text) => {
    if(!text) return;
    const typingTime = (text.length * 50) + (Math.random() * 1000 + 1000);
    const finalWait = Math.min(typingTime, 6000);
    await delay(finalWait);
};

const getRandomSuffixSafe = () => {
    if (Math.random() > 0.4) return ""; 
    const suffixes = [" 🙏", " يا غالي..", " نورتنا!", " أبشر بالخير.", " تفضل يا نشمي.."];
    return suffixes[Math.floor(Math.random() * suffixes.length)];
};

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const task = messageQueue.shift();
        try {
            await task();
        } catch (err) {
            console.log("خطأ في الطابور:", err.message);
        }
        const chatSwitchDelay = Math.floor(Math.random() * 2000) + 1000;
        await delay(chatSwitchDelay);
    }
    isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
        messageQueue.push(async () => {
            try {
                const urlPresence = `https://7103.api.greenapi.com/waInstance${CONFIG.ID_INSTANCE}/setPresence/${CONFIG.GREEN_TOKEN}`;
                const urlMessage = `https://7103.api.greenapi.com/waInstance${CONFIG.ID_INSTANCE}/sendMessage/${CONFIG.GREEN_TOKEN}`;
                
                // محاكاة يكتب الآن
                await axios.post(urlPresence, { chatId, presence: 'composing' });
                await waitTyping(text);
                
                const finalMessage = text + getRandomSuffixSafe();
                await axios.post(urlMessage, { chatId, message: finalMessage });
                
                console.log(`WA Message Sent to ${chatId} ✅`);
                resolve();
            } catch (err) {
                console.log("Error WA:", err.message);
                reject(err);
            }
        });
        processQueue();
    });
}
