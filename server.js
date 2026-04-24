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

// تحديث أسعار التوصيل عند التشغيل
fetchDeliveryPrices();

const userSessions = new Map();
const messageQueues = new Map();

/**
 * دالة معالجة الرسائل وإرسالها لـ OpenAI
 */
async function processFinalMessage(platform, senderId) {
    const session = userSessions.get(senderId);
    const msgs = messageQueues.get(senderId);
    
    if (!session || !msgs || msgs.length === 0) return;

    // 1. استدعاء التعليمات الأساسية دائمًا لضمان عدم النسيان
    const systemInstruction = fs.readFileSync('./prompt.txt', 'utf8').replace('{{PRICES}}', deliveryPricesText);

    // 2. تجهيز محتوى الرسائل الجديدة
    let userContent = [];
    msgs.forEach(msg => {
        if (msg.type === 'text') userContent.push({ type: "text", text: msg.data });
        if (msg.type === 'image') userContent.push({ type: "image_url", image_url: { url: msg.data } });
    });

    // إضافة المحتوى الجديد لتاريخ الجلسة
    session.history.push({ role: "user", content: userContent });
    messageQueues.delete(senderId); // تنظيف الطابور

    // 3. تنظيف التاريخ (إبقاء آخر 8 رسائل فقط لضمان التركيز العالي)
    if (session.history.length > 15) {
        session.history.splice(0, 2);
    }

    // 4. بناء مصفوفة الرسائل (التعليمات الثابتة + التاريخ)
    const messagesForOpenAI = [
        { role: "system", content: systemInstruction },
        ...session.history
    ];

    try {
        console.log(`🧠 جاري طلب الرد من صابر للرقم: ${senderId}`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesForOpenAI,
            temperature: 0, // للالتزام التام بالمنيو وعدم التأليف
            max_tokens: 400,
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        // إرسال الرد للمنصة المناسبة
        if (platform === 'whatsapp') {
            await sendWhatsAppMessage(senderId, botReply);
        } else if (platform === 'facebook') {
            await sendFacebookMessage(senderId, botReply);
        }

        // إرسال للمطبخ إذا تم التأكيد
        if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            const kitchenMsg = `🚨 *طلب جديد من ${platform === 'facebook' ? 'فيسبوك' : 'واتساب'}*:\n\n${cleanReply}`;
            await sendWhatsAppMessage(CONFIG.GROUP_ID, kitchenMsg);
        }

    } catch (error) {
        console.error("❌ خطأ في OpenAI:", error.message);
    }
}

/**
 * مسار الويب هوك الموحد (واتساب)
 */
app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');
    const data = req.body;

    if (data && data.typeWebhook === 'incomingMessageReceived') {
        const senderId = data.senderData.chatId;
        
        // تجاهل رسائل البوت نفسه
        if (data.senderData.sender.includes(CONFIG.ID_INSTANCE)) return;

        // تجاهل الجروبات وحالات الواتساب
        if (senderId.includes('@g.us') || senderId === 'status@broadcast') return;

        // تجهيز الجلسة
        if (!userSessions.has(senderId)) {
            userSessions.set(senderId, { history: [], timer: null });
        }

        // تحديد نوع الرسالة (نص أو صورة)
        let currentMsg = null;
        if (data.messageData.typeMessage === 'imageMessage') {
            currentMsg = { type: 'image', data: data.messageData.fileMessageData.downloadUrl };
        } else {
            const text = data.messageData.textMessageData?.textMessage || data.messageData.extendedTextMessageData?.text || "";
            if (text) currentMsg = { type: 'text', data: text };
        }

        if (!currentMsg) return;

        // إضافة الرسالة لطابور الانتظار
        if (!messageQueues.has(senderId)) messageQueues.set(senderId, []);
        messageQueues.get(senderId).push(currentMsg);

        // نظام الانتظار الذكي (5 ثوانٍ) لتجميع الرسائل
        const session = userSessions.get(senderId);
        if (session.timer) clearTimeout(session.timer);

        session.timer = setTimeout(() => {
            processFinalMessage('whatsapp', senderId);
        }, 5000);
    }
});

/**
 * مسارات الفيسبوك (Messenger)
 */
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
                const senderId = webhookEvent.sender.id;
                
                if (!userSessions.has(senderId)) {
                    userSessions.set(senderId, { history: [], timer: null });
                }
                
                if (!messageQueues.has(senderId)) messageQueues.set(senderId, []);
                messageQueues.get(senderId).push({ type: 'text', data: webhookEvent.message.text });

                const session = userSessions.get(senderId);
                if (session.timer) clearTimeout(session.timer);
                session.timer = setTimeout(() => {
                    processFinalMessage('facebook', senderId);
                }, 5000);
            }
        });
    } else {
        res.sendStatus(404);
    }
});

app.listen(CONFIG.PORT, () => {
    console.log(`🚀 صابر يعمل الآن بأعلى كفاءة على بورت ${CONFIG.PORT}`);
});
