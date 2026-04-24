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
const pendingResponses = new Map(); // لتجميع رسائل الزبون

async function processFinalMessage(platform, senderId) {
    const session = userSessions.get(senderId);
    if (!session || session.pendingContent.length === 0) return;

    console.log(`🧠 جاري تحليل جميع رسائل ${senderId} ورد واحد محترم...`);
    
    // دمج كل الرسائل (نصوص وصور) في مصفوفة واحدة
    session.history.push({ role: "user", content: session.pendingContent });
    session.pendingContent = []; // تصغير القائمة بعد المعالجة

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: session.history,
            max_tokens: 500,
            temperature: 0.2,
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, botReply);
        else if (platform === 'facebook') await sendFacebookMessage(senderId, botReply);

        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            const groupMsg = `🚨 طلب جديد من ${platform}!\nرقم: ${senderId}\n\n${cleanReply}`;
            await sendWhatsAppMessage(CONFIG.GROUP_ID, groupMsg);
        }
    } catch (error) {
        console.error("❌ خطأ:", error.message);
    }
}

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');
    const data = req.body;
    if (data && data.typeWebhook === 'incomingMessageReceived') {
        const senderId = data.senderData.chatId;
        if (data.senderData.sender.includes(CONFIG.ID_INSTANCE)) return;

        if (!userSessions.has(senderId)) {
            let systemPrompt = fs.readFileSync('./prompt.txt', 'utf8').replace('{{PRICES}}', deliveryPricesText);
            userSessions.set(senderId, { 
                history: [{ role: "system", content: systemPrompt }], 
                pendingContent: [],
                lastUpdated: Date.now() 
            });
        }

        const session = userSessions.get(senderId);
        
        // تجميع النص أو الصور
        if (data.messageData.typeMessage === 'imageMessage') {
            session.pendingContent.push({ type: "image_url", image_url: { url: data.messageData.fileMessageData.downloadUrl } });
            if (data.messageData.fileMessageData.caption) session.pendingContent.push({ type: "text", text: data.messageData.fileMessageData.caption });
        } else {
            const text = data.messageData.textMessageData?.textMessage || data.messageData.extendedTextMessageData?.text || "";
            if (text) session.pendingContent.push({ type: "text", text: text });
        }

        // إلغاء أي مؤقت قديم وتشغيل مؤقت جديد (ينتظر 10 ثواني)
        if (pendingResponses.has(senderId)) clearTimeout(pendingResponses.get(senderId));
        
        const timer = setTimeout(() => {
            processFinalMessage('whatsapp', senderId);
            pendingResponses.delete(senderId);
        }, 5000); // 10 ثواني انتظار

        pendingResponses.set(senderId, timer);
    }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 صابر "الذكي" يعمل الآن...`));
