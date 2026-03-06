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

const MENU_DATA = {
    "خابور كباب": { price: 2, img: "https://i.imgur.com/lhWRxlO.jpg" },
    "الوجبة العملاقة": { price: 3, img: "https://i.imgur.com/YBdJtXk.jpg" },
    "صاروخ شاورما": { price: 1.5, img: "https://i.imgur.com/KpajIR8.jpg" },
    "زنجر ديناميت": { price: 2, img: "https://i.imgur.com/sZhwxXE.jpg" }
};

let SESSIONS = {}; 

async function aiSalesman(userMsg, session) {
    const systemPrompt = `
    أنت مندوب مبيعات محترف ومختصر. 
    المنيو المتاح فقط: ${Object.keys(MENU_DATA).join(" - ")}.
    
    القواعد الصارمة:
    1. إذا سأل العميل "شو عندك" أو استفسر، أجب بنص فقط ولا تضع JSON نهائياً.
    2. لا تضف أي وجبة للسلة إلا إذا قال العميل بوضوح (أريد، أضف، اطلب، هات).
    3. إذا قرر العميل الشراء، أضف السطر التالي في نهاية ردك: [ORDER:{"items":[{"n":"اسم الوجبة","q":1}]}]
    4. إذا أراد العميل إلغاء الطلب أو البدء من جديد، أضف: [ACTION:CLEAR]
    5. رده الحالي في السلة: ${JSON.stringify(session.items)}.
    `;

    try {
        const res = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
            temperature: 0 // لضمان عدم الهلوسة والالتزام بالتعليمات
        }, { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } });

        return res.data.choices[0].message.content;
    } catch (e) { return "تفضل، كيف أقدر أساعدك؟"; }
}

const send = (id, text) => axios.post(`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`, { chatId: id, message: text });

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData.chatId;
    const userMsg = body.messageData?.textMessageData?.textMessage || "";

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { items: [], wallet: 0 };
    const session = SESSIONS[chatId];

    // أمر يدوي لتصفير السلة إذا علق البوت
    if (userMsg === "تصفير" || userMsg === "اعادة") {
        session.items = [];
        return send(chatId, "🗑 تم تصفير السلة، كيف أقدر أساعدك من جديد؟");
    }

    const aiRes = await aiSalesman(userMsg, session);

    // 1. معالجة تصفير السلة من الـ AI
    if (aiRes.includes("[ACTION:CLEAR]")) {
        session.items = [];
    }

    // 2. معالجة إضافة الطلب
    if (aiRes.includes("[ORDER:")) {
        const jsonStr = aiRes.split("[ORDER:")[1].split("]")[0];
        try {
            const data = JSON.parse(jsonStr);
            data.items.forEach(item => {
                const product = MENU_DATA[item.n];
                if (product) {
                    session.items.push({ name: item.n, price: product.price, qty: item.q });
                }
            });
        } catch (e) { console.log("JSON Error"); }
    }

    // 3. حساب المجموع الحالي (بدون هلوسة)
    const currentTotal = session.items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    // تنظيف الرد من الأكواد التقنية قبل إرساله للعميل
    let finalMsg = aiRes.split("[ORDER:")[0].split("[ACTION:")[0].trim();
    
    if (currentTotal > 0) {
        finalMsg += `\n\n🛒 سلتك حالياً: ${currentTotal} دينار.\n(للتأكيد أرسل "تأكيد" أو "تصفير" للبدء من جديد)`;
    }

    await send(chatId, finalMsg);
});

app.listen(3000);
