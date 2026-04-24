import express from 'express';
import { OpenAI } from 'openai';
import fs from 'fs';
import { CONFIG } from './config.js';
import { sendWhatsAppMessage, sendWhatsAppImage } from './whatsapp.js';
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
            temperature: 0, // تجميد البوت عشان ما يتفلسف
            top_p: 0,
            max_tokens: 400,
            presence_penalty: 0,
            frequency_penalty: 0,
        });

        let botReply = completion.choices[0].message.content;
        session.history.push({ role: "assistant", content: botReply });

        // 1. نظام إرسال المنيو بالصور
        if (botReply.includes("[SEND_MENU]")) {
            const cleanReply = botReply.replace("[SEND_MENU]", "").trim();
            if (platform === 'whatsapp') {
                if (cleanReply) await sendWhatsAppMessage(senderId, cleanReply);
                // ⚠️ استبدل هاي الروابط بروابط صور المنيو الحقيقية تبعتك
                const menuImages = [
                    "https://i.ibb.co/example1/menu1.jpg", 
                    "https://i.ibb.co/example2/menu2.jpg"
                ];
                for (let imageUrl of menuImages) {
                    await sendWhatsAppImage(senderId, imageUrl, "أزكى منيو لعيونك يا كابتن 🔥");
                }
            } else {
                await sendFacebookMessage(senderId, cleanReply + "\n(يرجى طلب الصور عبر واتساب حالياً)");
            }
        }
        // 2. نظام التوقف التلقائي (التدخل البشري)
        else if (botReply.includes("[PAUSE_BOT]")) {
            session.isPaused = true;
            const cleanReply = botReply.replace("[PAUSE_BOT]", "").trim();
            if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, cleanReply);
            else await sendFacebookMessage(senderId, cleanReply);
            
            await sendWhatsAppMessage(CONFIG.GROUP_ID, `🚨 طلب تدخل بشري!\nالزبون رقم ${senderId} يطلب الإدارة. (تم إيقاف البوت مؤقتاً عن هذه المحادثة).`);
        }
        // 3. نظام تأكيد الطلب
        else if (botReply.includes("[CONFIRMED_ORDER]")) {
            const cleanReply = botReply.replace("[CONFIRMED_ORDER]", "").trim();
            if (platform === 'whatsapp') await sendWhatsAppMessage(senderId, cleanReply);
            else await sendFacebookMessage(senderId, cleanReply);

            await sendWhatsAppMessage(CONFIG.GROUP_ID, `🚨 طلب جديد:\n${cleanReply}`);
        }
        // 4. الرد العادي
        else {
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

    // نقرأ رسائل الزبون (incoming) ورسائلك إنت من رقم المطعم (outgoing)
    if (data?.typeWebhook === 'incomingMessageReceived' || data?.typeWebhook === 'outgoingMessageReceived') {
        const senderId = data.senderData.chatId;
        // التحقق إذا الرسالة طالعة من تلفون المطعم (الأدمن)
        const isAdmin = data.senderData.sender.includes(CONFIG.ID_INSTANCE); 

        let text = data.messageData?.textMessageData?.textMessage || data.messageData?.extendedTextMessageData?.text || "";

        // --- نظام زر الطوارئ الموحد (sjs) ---
        if (isAdmin) {
            // إذا كتبت sjs لحالها في المحادثة
            if (text.toLowerCase().trim() === 'sjs') {
                if (!userSessions.has(senderId)) {
                    userSessions.set(senderId, { history: [], timer: null, isPaused: false });
                }
                const session = userSessions.get(senderId);
                
                // التبديل: إذا شغال بوقفه، وإذا واقف بشغله
                session.isPaused = !session.isPaused; 
                
                const status = session.isPaused ? "⏸️ تم إيقاف البوت" : "▶️ تم إعادة تشغيل البوت";
                console.log(`${status} للمحادثة: ${senderId}`);
            }
            return; // بكل الأحوال بنعمل return عشان البوت ما يقرأ كلام المطعم ويرد عليه
        }

        // --- معالجة رسائل الزبون ---
        if (!userSessions.has(senderId)) {
            userSessions.set(senderId, { history: [], timer: null, isPaused: false });
        }

        // 🛑 إذا البوت واقف بهي المحادثة، بنطنش رسالة الزبون وخلي الإدارة ترد
        if (userSessions.get(senderId).isPaused) {
            return; 
        }

        let currentMsg = null;
        if (data.messageData?.typeMessage === 'imageMessage') {
            currentMsg = { type: 'image', data: data.messageData.fileMessageData.downloadUrl };
        } else if (text) {
            currentMsg = { type: 'text', data: text };
        }

        if (!currentMsg) return;
        if (!messageQueues.has(senderId)) messageQueues.set(senderId, []);
        messageQueues.get(senderId).push(currentMsg);

        const session = userSessions.get(senderId);
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => processFinalMessage('whatsapp', senderId), 4000);
    }
});

app.listen(CONFIG.PORT, () => console.log(`🚀 صابر "الحديد" جاهز... زر الطوارئ هو sjs`));
