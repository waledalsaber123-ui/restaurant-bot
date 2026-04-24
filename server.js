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
const SESSION_TTL = 24 * 60 * 60 * 1000;

async function processMessage(platform, senderId, text, imageUrl = null) {
    console.log(`🤖 معالجة من ${platform}: ${senderId}`);
    
    if (!userSessions.has(senderId)) {
        let systemPrompt = fs.readFileSync('./prompt.txt', 'utf8').replace('{{PRICES}}', deliveryPricesText);
        userSessions.set(senderId, { history: [{ role: "system", content: systemPrompt }], lastUpdated: Date.now() });
    }

    const session = userSessions.get(senderId);
    session.lastUpdated = Date.now();

    // تجهيز محتوى الرسالة (نص أو صورة)
    let userContent = [];
    if (text) userContent.push({ type: "text", text: text });
    if (imageUrl) {
        userContent.push({ 
            type: "image_url", 
            image_url: { url: imageUrl, detail: "low" } // detail: low لتوفير التكلفة
        });
        userContent.push({ type: "text", text: "يا صابر، هاي صورة بعتها الزبون، شو فيها وشو بنقدر نعرض عليه من المنيو تبعنا؟" });
    }

    session.history.push({ role: "user", content: userContent });

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // هذا الموديل يدعم الرؤية وسريع جداً
            messages: session.history,
            max_tokens: 300,
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, cleanReply);
            const groupMsg = `🚨 طلب جديد من ${platform}!\nرقم: ${senderId}\n\n${cleanReply}`;
            await sendWhatsAppMessage(CONFIG.GROUP_ID, groupMsg);
        } else {
            if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, botReply);
            else if (platform === 'facebook') await sendFacebookMessage(senderId, botReply);
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
        let text = data.messageData.textMessageData?.textMessage || "";
        let imageUrl = null;

        // إذا كانت الرسالة صورة
        if (data.messageData.typeMessage === 'imageMessage') {
            imageUrl = data.messageData.fileMessageData.downloadUrl;
            text = data.messageData.fileMessageData.caption || "بعث صورة";
        }

        if (senderId.includes('@c.us') && !data.senderData.sender.includes(CONFIG.ID_INSTANCE)) {
            await processMessage('whatsapp', senderId, text, imageUrl);
        }
    }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 صابر "البصير" يعمل على بورت ${CONFIG.PORT}`));
