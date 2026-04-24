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

    let userContent = [];
    if (imageUrl) {
        // إذا بعت صورة، بنخلي صابر يركز عليها ويربطها بالمنيو فوراً
        userContent.push({ 
            type: "image_url", 
            image_url: { url: imageUrl } 
        });
        userContent.push({ type: "text", text: `يا صابر، الزبون بعت هاي الصورة وبيسأل عنها. حللها وجاوبه بأسلوبك الودود (أبشر ومن عيوني) وكمّل معه الطلب: ${text}` });
    } else {
        userContent.push({ type: "text", text: text });
    }

    session.history.push({ role: "user", content: userContent });

    // تنظيف الذاكرة القديمة إذا زادت عن 10 رسايل عشان ما يضيع
    if (session.history.length > 12) {
        session.history.splice(1, 2);
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", 
            messages: session.history,
            max_tokens: 500, // زدنا التوكنز عشان التحليل يكون أدق
            temperature: 0.2, // دقة أعلى في الأرقام
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        // إرسال الرد للزبون
        if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, botReply);
        else if (platform === 'facebook') await sendFacebookMessage(senderId, botReply);

        // إذا تأكد الطلب، ابعت للمطبخ
        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            const groupMsg = `🚨 طلب جديد من ${platform}!\nرقم: ${senderId}\n\n${cleanReply}`;
            await sendWhatsAppMessage(CONFIG.GROUP_ID, groupMsg);
        }

    } catch (error) {
        console.error("❌ خطأ في OpenAI:", error.message);
    }
}

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
