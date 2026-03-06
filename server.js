import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// إعدادات البيئة
const CONFIG = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    DELIVERY_SHEET_URL: process.env.DELIVERY_SHEET_URL,
    ORDER_GROUP_ID: "120363407952234395@g.us",
    BASE_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* =========================================
   قاعدة البيانات (Menu & Images)
   ========================================= */
const MENU_DATA = {
    "خابور كباب": { price: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة سناكات": { price: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "الوجبة العائلية سناكات": { price: 5, img: "https://i.imgur.com/6uzbeo4.jpg" },
    "الوجبة الاقتصادية سناكات": { price: 2, img: "https://i.imgur.com/pvBkKto.jpg" },
    "وجبة زنجر عادي": { price: 2, img: "https://i.imgur.com/wgjBv86.jpg" },
    "قمبلة رمضان برجر": { price: 2.25, img: "https://i.imgur.com/NrPMh4h.jpg" },
    "الوجبة الاقتصادية شورما": { price: 2, img: "https://i.imgur.com/rmq4PS0.jpg" },
    "صاروخ الشاورما": { price: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت العرض": { price: 2, img: "https://i.imgur.com/sZhwxXE.jpg" },
    "الشاورما العائلية الاوفر": { price: 5, img: "https://i.imgur.com/tZedL2M.jpg" },
    "وجبة برجر لحمة 150 غم": { price: 2, img: "https://i.imgur.com/9S1VGKX.jpg" },
    "وجبة سكالوب": { price: 2, img: "https://i.imgur.com/CEdT5cx.jpg" },
    "وجبات الشورما الفردية": { price: 1.5, img: "https://i.imgur.com/FaZvkHe.jpg" }
};

const SESSIONS = {}; // ذاكرة مؤقتة للطلبات والمحافظ
let DELIVERY_ZONES = [];

/* =========================================
   الدوال المساعدة (Helpers)
   ========================================= */

// تحميل بيانات التوصيل من الإكسل
async function updateDeliveryData() {
    try {
        const res = await axios.get(CONFIG.DELIVERY_SHEET_URL);
        DELIVERY_ZONES = await csv().fromString(res.data);
    } catch (e) { console.error("Error loading CSV"); }
}

// إرسال رسالة نصية
async function sendMsg(chatId, message) {
    await axios.post(`${CONFIG.BASE_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId, message });
}

// إرسال صورة مع نص
async function sendImg(chatId, url, caption) {
    await axios.post(`${CONFIG.BASE_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, {
        chatId, urlFile: url, fileName: "item.jpg", caption
    });
}

// تنظيف النص
const normalize = (t) => t?.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();

/* =========================================
   محرك الذكاء الاصطناعي (AI Core)
   ========================================= */

async function aiBrain(userMsg, userData) {
    const systemPrompt = `
    أنت مندوب مبيعات ذكي ومرح في مطعم "لذيذ". 
    المنيو: ${JSON.stringify(MENU_DATA)}
    
    مهامك:
    1. إذا طلب العميل وجبة، استخرج الاسم والكمية بصيغة JSON في نهاية الرد.
    2. كن ذكياً في البيع (Upselling): إذا طلب وجبة فردية، اقترح "صاروخ شاورما" أو "عرض عائلي".
    3. إذا سأل عن رصيد محفظته، أخبره أن رصيده الحالي هو ${userData.wallet} دينار.
    4. شجع العميل على إتمام الطلب بكلمة "تأكيد".

    يجب أن يكون ردك نصي طبيعي، وإذا وجد طلب، أضف في سطر منفصل تماماً: 
    ORDER_JSON: {"items": [{"name": "اسم الوجبة", "qty": 1}]}
    `;

    try {
        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMsg }
            ]
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return response.data.choices[0].message.content;
    } catch (e) { return "عذراً، واجهت مشكلة فنية. كيف يمكنني مساعدتك؟"; }
}

/* =========================================
   معالجة الرسائل (Webhook)
   ========================================= */

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;

    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData.chatId;
    const senderName = body.senderData.senderName;
    const userMsg = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";

    // منع الرد على الجروبات إلا في حالات "سحب الطلب"
    if (chatId.endsWith("@g.us")) {
        if (userMsg.startsWith("سحب")) {
            const orderNum = userMsg.split(" ")[1];
            await sendMsg(chatId, `✅ المندوب ${senderName} سحب الطلب رقم #${orderNum}`);
        }
        return;
    }

    // تهيئة جلسة المستخدم
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], wallet: 0, area: null, deliveryFee: 0 };
    const session = SESSIONS[chatId];

    await updateDeliveryData();

    // 1. منطق "تأكيد الطلب"
    if (normalize(userMsg).includes("تاكيد")) {
        if (session.items.length === 0) return sendMsg(chatId, "سلتك فارغة! ماذا تحب أن تطلب؟");
        
        let total = session.items.reduce((sum, i) => sum + (i.price * i.qty), 0) + session.deliveryFee;
        let summary = session.items.map(i => `• ${i.name} (${i.qty})`).join("\n");
        let orderId = Math.floor(1000 + Math.random() * 9000);

        const groupText = `🔔 *طلب جديد #${orderId}*\n👤 العميل: ${senderName}\n📍 المنطقة: ${session.area || "غير محدد"}\n🛒 الطلب:\n${summary}\n💰 المجموع: ${total} دينار\n---\nلسحب الطلب أرسل: سحب ${orderId}`;
        
        await sendMsg(CONFIG.ORDER_GROUP_ID, groupText);
        await sendMsg(chatId, `✅ تم إرسال طلبك للمطعم (رقم الطلب #${orderId}).\nسيقوم المندوب بالتواصل معك قريباً.`);
        SESSIONS[chatId].items = []; // تصغير السلة بعد الطلب
        return;
    }

    // 2. فحص مناطق التوصيل
    for (const zone of DELIVERY_ZONES) {
        if (normalize(userMsg).includes(normalize(zone.area))) {
            session.area = zone.area;
            session.deliveryFee = parseFloat(zone.price);
            return sendMsg(chatId, `📍 تم تحديد منطقة التوصيل: ${zone.area}\nرسوم التوصيل: ${zone.price} دينار.`);
        }
    }

    // 3. معالجة النص عبر الذكاء الاصطناعي
    const aiResponse = await aiBrain(userMsg, session);
    
    // استخراج الـ JSON من رد الذكاء الاصطناعي (إن وجد)
    if (aiResponse.includes("ORDER_JSON:")) {
        const jsonPart = aiResponse.split("ORDER_JSON:")[1].trim();
        try {
            const parsed = JSON.parse(jsonPart);
            for (const item of parsed.items) {
                const product = MENU_DATA[item.name];
                if (product) {
                    session.items.push({ name: item.name, qty: item.qty, price: product.price });
                    // إرسال صورة المنتج فوراً (المندوب الذكي)
                    await sendImg(chatId, product.img, `إليك صورة ${item.name} الشهية! 😋`);
                }
            }
        } catch (e) { console.log("AI JSON Error"); }
    }

    // إرسال رد البوت النصي (الذي يحتوي على البيع الذكي والاقتراحات)
    const cleanReply = aiResponse.split("ORDER_JSON:")[0].trim();
    await sendMsg(chatId, cleanReply);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Sales Bot is Flying on port ${PORT}`);
});
