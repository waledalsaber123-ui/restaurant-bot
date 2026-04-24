import express from 'express';
import { OpenAI } from 'openai';
import fs from 'fs';
import { CONFIG } from './config.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { sendFacebookMessage } from './facebook.js';
import { fetchDeliveryPrices, deliveryPricesText } from './prices.js';

const app = express();
app.use(express.json());
const openai = new OpenAI({ apiKey: CONFIG.OPENAI_KEY });
fetchDeliveryPrices();

const userSessions = new Map();
const messageQueues = new Map();

async function processFinalMessage(platform, senderId) {
    const session = userSessions.get(senderId);
    const msgs = messageQueues.get(senderId);
    if (!session || !msgs || msgs.length === 0) return;

    const systemInstruction = fs.readFileSync('./prompt.txt', 'utf8').replace('{{PRICES}}', deliveryPricesText);

    let userContent = [];
    msgs.forEach(msg => {
        if (msg.type === 'text') userContent.push({ type: "text", text: msg.data });
        if (msg.type === 'image') userContent.push({ type: "image_url", image_url: { url: msg.data } });
    });

    session.history.push({ role: "user", content: userContent });
    messageQueues.delete(senderId);

    // ذاكرة حديدية: لا تمسح أي شيء إلا إذا تجاوزت المحادثة 30 رسالة
    if (session.history.length > 30) {
        session.history.splice(1, 2); 
    }

    const messagesForOpenAI = [
        { role: "system", content: systemInstruction },
        ...session.history
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesForOpenAI,
            temperature: 0, // منع الهبد والترحيب المكرر
            presence_penalty: -1.0, // إجبار البوت على عدم تغيير الموضوع
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, botReply);
        else if (platform === 'facebook') await sendFacebookMessage(senderId, botReply);

        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            await sendWhatsAppMessage(CONFIG.GROUP_ID, `🚨 طلب جديد:\n${cleanReply}`);
        }
    } catch (error) {
        console.error("❌ خطأ:", error.message);
    }
}

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');
    const data = req.body;
    if (data?.typeWebhook === 'incomingMessageReceived') {
        const senderId = data.senderData.chatId;
        if (data.senderData.sender.includes(CONFIG.ID_INSTANCE)) return;

        if (!userSessions.has(senderId)) {
            userSessions.set(senderId, { history: [], timer: null });
        }

        let currentMsg = null;
        if (data.messageData.typeMessage === 'imageMessage') {
            currentMsg = { type: 'image', data: data.messageData.fileMessageData.downloadUrl };
        } else {
            const text = data.messageData.textMessageData?.textMessage || data.messageData.extendedTextMessageData?.text || "";
            if (text) currentMsg = { type: 'text', data: text };
        }

        if (!currentMsg) return;
        if (!messageQueues.has(senderId)) messageQueues.set(senderId, []);
        messageQueues.get(senderId).push(currentMsg);

        const session = userSessions.get(senderId);
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => processFinalMessage('whatsapp', senderId), 4000);
    }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 صابر "الحديد" جاهز...`));
