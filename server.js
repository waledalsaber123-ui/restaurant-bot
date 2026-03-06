import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const CONFIG = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    ORDER_GROUP_ID: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const MENU = {
    "خابور كباب": { p: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { p: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { p: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { p: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
};

let SESSIONS = {};

async function mandoubAI(userMsg, session) {
    // برومبت صارم جداً لتقليل "الهلوسة" وتوفير التكلفة
    const prompt = `
    أنت مندوب مبيعات. المنيو المتاحة: ${Object.keys(MENU).join(" - ")}.
    
    القواعد النهائية:
    1. إذا العميل يسأل "شو عندك" أو "شو المنيو"، رد بذكر الأصناف فقط. (ممنوع إضافة أي شيء للسلة).
    2. لا تضف وجبة إلا إذا طلب العميل بوضوح: "أريد"، "أضف"، "سجل لي"، "واحد زنجر".
    3. إذا أضاف وجبة، استخدم الصيغة: [ACTION:ADD:اسم الوجبة:الكمية]
    4. إذا طلب الحذف أو البدء من جديد، استخدم: [ACTION:CLEAR]
    5. سلة العميل الحالية: ${JSON.stringify(session.items)}. رصيد محفظته: ${session.wallet}.
    6. ردك يجب أن يكون قصيراً ومحفزاً للبيع (Upselling).
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini", 
            messages: [{ role: "system", content: prompt }, { role: "user", content: userMsg }],
            temperature: 0, // صفر يعني لا مجال للتأليف أو الهلوسة
            max_tokens: 120
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return res.data.choices[0].message.content;
    } catch (e) { return "تفضل يا غالي، كيف أخدمك؟"; }
}

const send = (id, text) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message: text });
const sendImg = (id, url, cap) => axios.post(`${CONFIG.API_URL}/sendFileByUrl/${CONFIG.GREEN_TOKEN}`, { chatId: id, urlFile: url, fileName: "food.jpg", caption: cap });

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData.chatId;
    const userMsg = (body.messageData?.textMessageData?.textMessage || "").trim();

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], wallet: 0 };
    const session = SESSIONS[chatId];

    // تصفير يدوي سريع (للأمان)
    if (userMsg === "تصفير" || userMsg === "اعادة") {
        session.items = [];
        return send(chatId, "🗑 تم تصفير سلتك بالكامل. شو حابب تطلب الآن؟");
    }

    const aiResponse = await mandoubAI(userMsg, session);

    // معالجة الأوامر البرمجية من الـ AI
    if (aiResponse.includes("[ACTION:CLEAR]")) {
        session.items = [];
    }

    if (aiResponse.includes("[ACTION:ADD:")) {
        const parts = aiResponse.match(/\[ACTION:ADD:(.*?):(\d+)\]/);
        if (parts) {
            const name = parts[1].trim();
            const qty = parseInt(parts[2]);
            if (MENU[name]) {
                session.items.push({ name, price: MENU[name].p, qty });
                // مندوب ذكي: يرسل صورة الوجبة فوراً عند إضافتها
                await sendImg(chatId, MENU[name].img, `تم إضافة ${name} لسلتك بنجاح! 😋`);
            }
        }
    }

    // حساب المجموع الحقيقي
    const total = session.items.reduce((s, i) => s + (i.price * i.qty), 0);
    
    // تنظيف النص من الأكواد قبل إرساله للعميل
    let cleanMsg = aiResponse.replace(/\[ACTION:.*?\]/g, "").trim();

    // إضافة ملخص الطلب فقط إذا كان هناك أصناف فعلاً
    if (total > 0 && !aiResponse.includes("[ACTION:CLEAR]")) {
        cleanMsg += `\n\n🛒 مجموعك الحالي: ${total} دينار.\n(أرسل "تأكيد" للطلب النهائي)`;
    }

    // منطق الترحيل للجروب
    if (userMsg.includes("تأكيد") && total > 0) {
        const orderSummary = session.items.map(i => `${i.name} (${i.qty})`).join(", ");
        await send(CONFIG.ORDER_GROUP_ID, `📦 طلب جديد!\nالعميل: ${chatId}\nالأصناف: ${orderSummary}\nالمجموع: ${total}د`);
        session.items = []; // تصفير السلة بعد التأكيد
        return send(chatId, "✅ تم ترحيل طلبك للمطعم بنجاح. وصحتين وعافية!");
    }

    await send(chatId, cleanMsg);
});

app.listen(3000);
