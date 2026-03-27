import express from "express";
import { CONFIG } from "./config.js";
import { runAI } from "./ai.js";
import { sendMessage as sendWA } from "./whatsapp.js";
import { sendFB } from "./facebook.js";

const app = express();
app.use(express.json());

/* ================= دالة التوجيه الذكية (واتساب أو فيسبوك) ================= */
async function sendMsg(platform, chatId, text) {
    if (platform === "facebook") {
        await sendFB(chatId, text);
    } else {
        await sendWA(chatId, text);
    }
}

/* ================= التحقق من Webhook (Facebook) ================= */
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "SaberJo_Secret_2026";
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK VERIFIED ✅");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

/* ================= استقبال الرسائل من كل المنصات ================= */
app.post("/webhook", async (req, res) => {
    const body = req.body;

    // ---------------------------------------------------------
    // 1. قسم معالجة رسائل (فيسبوك / إنستغرام)
    // ---------------------------------------------------------
    if (body.object === "page" || body.object === "instagram") {
        res.sendStatus(200); // الرد السريع لفيسبوك لتجنب الأخطاء (Timeout)
        
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            const chatId = messaging.sender.id;
            const text = messaging.message.text;
            console.log("Incoming FB/Insta message:", chatId, text);

            try {
                // إرسال النص للذكاء الاصطناعي
                const aiResponse = await runAI(text);
                
                // إرسال الرد للزبون
                if(aiResponse.reply) {
                    await sendMsg("facebook", chatId, aiResponse.reply);
                }
                
                // إذا اكتمل الطلب، إرساله لجروب المطبخ على الواتساب
                if(aiResponse.kitchenOrder && aiResponse.kitchenOrder.trim() !== "") {
                    await sendMsg("wa", CONFIG.GROUP_ID, `[KITCHEN_GO]\n${aiResponse.kitchenOrder}`);
                }
            } catch (error) {
                console.error("Error processing FB message:", error);
            }
        }
        return;
    }

    // ---------------------------------------------------------
    // 2. قسم معالجة رسائل (واتساب - GreenAPI)
    // ---------------------------------------------------------
    if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        
        // فحص نوع الرسالة (صورة، صوت، فيديو، أو ملف)
        const typeMessage = body.messageData?.typeMessage;
        const isMediaMessage = typeMessage === "imageMessage" || 
                               typeMessage === "audioMessage" ||
                               typeMessage === "videoMessage" ||
                               typeMessage === "documentMessage";

        const text = body.messageData?.textMessageData?.textMessage ||
                     body.messageData?.extendedTextMessageData?.text;

        const messageTimestamp = body.timestamp; 
        const currentTimestamp = Math.floor(Date.now() / 1000); 
        
        // تجاهل الرسائل القديمة (أكثر من 3 دقائق)
        if (currentTimestamp - messageTimestamp > 180) {
            console.log(`⚠️ تخطي رسالة قديمة من ${chatId}`);
            return res.sendStatus(200);
        }

        // تجاهل رسائل البوت لنفسه
        if (body.senderData?.sender === body.instanceData?.wid) {
            return res.sendStatus(200);
        }
        
        // معالجة الرسائل القادمة من الأفراد فقط (وليس الجروبات)
        if (chatId && !chatId.endsWith("@g.us")) {
            res.sendStatus(200); // الرد السريع لـ GreenAPI

            // 🛑 إذا أرسل الزبون صورة أو فويس نوت (الرفض اللطيف لتوفير التوكنز):
            if (isMediaMessage) {
                console.log(`Media received from ${chatId}, sending polite rejection.`);
                await sendMsg("wa", chatId, "عذراً يا غالي، لضمان دقة طلبك أنا حالياً بستقبل الطلبات المكتوبة فقط. يا ريت تكتبلي طلبك أو استفسارك كتابة ومن عيوني بكمل معك 🙏");
                return; // إيقاف التنفيذ هنا
            }

            // ✅ إذا كانت الرسالة نصية عادية:
            if (text) {
                console.log("Incoming WA message:", chatId, text);
                try {
                     const aiResponse = await runAI(text);
                     
                     if(aiResponse.reply) {
                         await sendMsg("wa", chatId, aiResponse.reply);
                     }
                     
                     if(aiResponse.kitchenOrder && aiResponse.kitchenOrder.trim() !== "") {
                         await sendMsg("wa", CONFIG.GROUP_ID, `[KITCHEN_GO]\n${aiResponse.kitchenOrder}`);
                     }
                } catch (error) {
                    console.error("Error processing WA message:", error);
                }
            }
            return;
        }
    }

    res.sendStatus(200);
});

/* ================= تشغيل السيرفر ================= */
app.listen(CONFIG.PORT, () => {
    console.log(`🚀 Saber Smart Engine is Live on port ${CONFIG.PORT}!`);
});
