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

setInterval(() => {
    const now = Date.now();
    for (let [userId, session] of userSessions.entries()) {
        if (now - session.lastUpdated > SESSION_TTL) {
            userSessions.delete(userId);
        }
    }
}, 60 * 60 * 1000);

async function processMessage(platform, senderId, text) {
    console.log(`🤖 جاري معالجة رسالة من ${platform} للرقم: ${senderId}`);
    
    if (!userSessions.has(senderId)) {
        let systemPrompt = "";
        try {
            systemPrompt = fs.readFileSync('./prompt.txt', 'utf8');
            systemPrompt = systemPrompt.replace('{{PRICES}}', deliveryPricesText);
        } catch (err) {
            systemPrompt = `أنت مساعد مطعم Saber Jo Snack. الأسعار: ${deliveryPricesText}`;
        }

        userSessions.set(senderId, {
            history: [{ role: "system", content: systemPrompt }],
            lastUpdated: Date.now()
        });
    }

    const session = userSessions.get(senderId);
    session.lastUpdated = Date.now();
    session.history.push({ role: "user", content: text });

    if (session.history.length > 11) { 
        session.history.splice(1, 2); 
    }

    try {
        console.log("🧠 جاري طلب الرد من OpenAI...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: session.history,
            max_tokens: 250,
            temperature: 0.1, 
        });

        let botReply = completion.choices[0].message.content;
        console.log("✅ استلمت الرد من OpenAI بنجاح.");
        session.history.push({ role: "assistant", content: botReply });

        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            
            if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, cleanReply);
            else if (platform === 'facebook') await sendFacebookMessage(senderId, cleanReply);

            const platformName = platform === 'facebook' ? 'فيسبوك ماسنجر 🔵' : 'واتساب 🟢';
            const groupMessage = `🚨 *طلب جديد من ${platformName}!*\nرقم: ${senderId.replace('@c.us', '')}\n\n*التفاصيل:*\n${cleanReply}`;
            await sendWhatsAppMessage(CONFIG.GROUP_ID, groupMessage);

        } else {
            if (platform === 'whatsapp') {
                console.log("📨 جاري إرسال الرد إلى واتساب...");
                await sendWhatsAppMessage(senderId, botReply);
            } else if (platform === 'facebook') {
                await sendFacebookMessage(senderId, botReply);
            }
        }

    } catch (error) {
        console.error("❌ خطأ في OpenAI أو الإرسال:", error.message);
        if (error.message.includes("401") || error.message.includes("API key")) {
            console.error("⚠️ مشكلة في مفتاح OpenAI Key.. تأكد منه في Render!");
        }
    }
}

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK'); 
    try {
        const data = req.body;
        
        // فحص نوع الرسالة بدقة
        if (data && data.typeWebhook === 'incomingMessageReceived') {
             const messageData = data.messageData;
             const senderData = data.senderData;

             if (messageData && (messageData.typeMessage === 'textMessage' || messageData.typeMessage === 'extendedTextMessage')) {
                 const senderId = senderData.chatId;
                 const text = messageData.textMessageData?.textMessage || messageData.extendedTextMessageData?.text || "";
                 
                 // الشرط الصارم: لا ترد على الجروبات ولا على نفسك
                 if (senderId.includes('@c.us') && !senderId.includes('@g.us') && !senderData.sender.includes(CONFIG.ID_INSTANCE)) {
                    await processMessage('whatsapp', senderId, text);
                 } else {
                    console.log("🚫 تم تجاهل الرسالة (إما جروب أو رسالة من البوت نفسه).");
                 }
             }
        }
    } catch (error) {
        console.error("خطأ Webhook:", error.message);
    }
});

app.get('/webhook/facebook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === CONFIG.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook/facebook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');
        body.entry.forEach(async (entry) => {
            const webhookEvent = entry.messaging[0];
            if (webhookEvent.message && webhookEvent.message.text) {
                await processMessage('facebook', webhookEvent.sender.id, webhookEvent.message.text);
            }
        });
    } else {
        res.sendStatus(404);
    }
});

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 Server is running on port ${CONFIG.PORT}`);
});
