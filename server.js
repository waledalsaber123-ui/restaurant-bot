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

async function processMessage(platform, senderId, messageList) {
    if (!userSessions.has(senderId)) {
        let systemPrompt = fs.readFileSync('./prompt.txt', 'utf8').replace('{{PRICES}}', deliveryPricesText);
        userSessions.set(senderId, { history: [{ role: "system", content: systemPrompt }] });
    }

    const session = userSessions.get(senderId);
    let userContent = [];

    messageList.forEach(msg => {
        if (msg.type === 'text') userContent.push({ type: "text", text: msg.data });
        if (msg.type === 'image') userContent.push({ type: "image_url", image_url: { url: msg.data } });
    });

    session.history.push({ role: "user", content: userContent });

    // تنظيف الذاكرة (إبقاء آخر 15 رسالة للسياق)
    if (session.history.length > 15) session.history.splice(1, 2);

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: session.history,
            temperature: 0.1, // تقليل العشوائية عشان ما يكرر ترحيب
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, botReply);
        else if (platform === 'facebook') await sendFacebookMessage(senderId, botReply);

        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            await sendWhatsAppMessage(CONFIG.GROUP_ID, `🚨 طلب جديد من ${senderId}:\n\n${cleanReply}`);
        }
    } catch (error) {
        console.error("❌ خطأ:", error.message);
    }
}

const messageQueues = new Map();

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');
    const data = req.body;
    if (data?.typeWebhook === 'incomingMessageReceived') {
        const senderId = data.senderData.chatId;
        if (data.senderData.sender.includes(CONFIG.ID_INSTANCE)) return;

        let currentMsg = null;
        if (data.messageData.typeMessage === 'imageMessage') {
            currentMsg = { type: 'image', data: data.messageData.fileMessageData.downloadUrl };
        } else {
            const text = data.messageData.textMessageData?.textMessage || data.messageData.extendedTextMessageData?.text || "";
            if (text) currentMsg = { type: 'text', data: text };
        }

        if (!currentMsg) return;

        // نظام التجميع: انتظر 5 ثواني لجمع الرسايل ورا بعض
        if (!messageQueues.has(senderId)) messageQueues.set(senderId, []);
        messageQueues.get(senderId).push(currentMsg);

        clearTimeout(userSessions.get(senderId)?.timer);
        const timer = setTimeout(() => {
            const msgs = messageQueues.get(senderId);
            messageQueues.delete(senderId);
            processMessage('whatsapp', senderId, msgs);
        }, 5000); // 5 ثواني انتظار كافية جداً

        if (!userSessions.has(senderId)) userSessions.set(senderId, { history: [], timer: timer });
        else userSessions.get(senderId).timer = timer;
    }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 صابر يعمل بنظام الذاكرة المستمرة...`));
