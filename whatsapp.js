import axios from "axios";
import { CONFIG } from "./config.js";

const messageQueue = [];
let isProcessingQueue = false;
const sentCache = new Map();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const { chatId, text, resolve, reject } = messageQueue.shift();

    try {
      const idInstance = String(CONFIG.ID_INSTANCE).trim();
      const apiToken = String(CONFIG.GREEN_TOKEN).trim();

      const key = \`\${chatId}_\${text}\`;
      const now = Date.now();

      if (sentCache.has(key) && now - sentCache.get(key) < 10000) {
        console.log("Duplicate prevented");
        resolve();
        continue;
      }

      sentCache.set(key, now);

      const url = \`https://7103.api.greenapi.com/waInstance\${idInstance}/sendMessage/\${apiToken}\`;

      const response = await axios.post(url, {
        chatId,
        message: text,
      });

      if (response.data?.idMessage) {
        console.log("Message sent:", response.data.idMessage);
        resolve();
      } else {
        resolve();
      }
    } catch (err) {
      console.error("WHATSAPP ERROR:", err.response?.data || err.message);
      reject(err);
    }

    await delay(2500);
  }

  isProcessingQueue = false;
}

export function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    if (!chatId || !text?.trim()) return resolve();
    messageQueue.push({ chatId, text, resolve, reject });
    processQueue();
  });
}
