import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
    OPENAI_KEY:    process.env.OPENAI_KEY,
    GREEN_TOKEN:   process.env.GREEN_TOKEN,
    ID_INSTANCE:   process.env.ID_INSTANCE,
    PAGE_TOKEN:    process.env.PAGE_TOKEN,
    KITCHEN_GROUP: "120363407952234395@g.us",
API_URL: `https://api.green-api.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= التحقق من Webhook (Facebook) ================= */
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "SaberJo_Secret_2026";
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("WEBHOOK VERIFIED ✅");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

/* ================= إرسال رسالة واتساب ================= */
async function sendWA(chatId, message) {
    try {
        // التعديل هون: التوكن صار جزء من الرابط وشلنا الـ headers
        const url = `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`;
        
        await axios.post(url, { chatId, message });
        
        console.log(`WA Message Sent to ${chatId} ✅`);
    } catch (err) {
        console.log("Error WA Detailed:", err.response?.data || err.message);
    }
}

/* ================= إرسال رسالة فيسبوك ================= */
async function sendFB(psid, message) {
    try {
        await axios.post(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`,
            {
                recipient: { id: psid },
                message:   { text: message }
            }
        );
    } catch (err) {
        console.log("Error FB:", err.response?.data || err.message);
    }
}

/* ================= helper للإرسال حسب المنصة ================= */
async function sendMsg(platform, chatId, message) {
    platform === "facebook"
        ? await sendFB(chatId, message)
        : await sendWA(chatId, message);
}

/* ================= معالجة رسائل المستخدم ================= */
async function handleUserMessage(chatId, userMessage, platform = "wa") {
    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

    /* 1. تأكيد الطلب وإرساله للمطبخ */
    if (/^(تم|تمام|ايوا|ok|أكد|تاكيد)$/i.test(userMessage.trim()) && session.lastKitchenMsg) {
        await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        await sendMsg(platform, chatId, "أبشر يا غالي، طلبك وصل للمطبخ وصار يتجهز! نورت مطعم صابر جو 🙏");
        session.lastKitchenMsg = null;
        return;
    }

    /* 2. استدعاء الذكاء الاصطناعي */
    try {
        const aiResponse = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: getSystemPrompt() },
                    ...session.history.slice(-18),
                    { role: "user", content: userMessage }
                ],
                temperature: 0
            },
            {
                headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` },
                timeout: 30000
            }
        );

        let reply = aiResponse.data.choices[0].message.content;

        /* 3. فحص إذا الرد يحتوي على أمر المطبخ */
        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            const customerReply = parts[0].trim(); 
            const kitchenOrder = parts[1].trim();  

            // تخزين الملخص كامل
            session.lastKitchenMsg = kitchenOrder;

            // رد الزبون
            const finalReply = customerReply + "\n\nاكتب **تم** للتأكيد ✅";
            await sendMsg(platform, chatId, finalReply);
        } else {
            let finalReply = reply;
            if (session.lastKitchenMsg) {
                finalReply += "\n\n⚠️ حبيبنا، في طلب معلق بانتظار تأكيدك! اكتب **تم** عشان نبعثه للمطبخ فوراً.";
            }
            await sendMsg(platform, chatId, finalReply);
        }

        /* 4. حفظ المحادثة في التاريخ */
        session.history.push(
            { role: "user", content: userMessage },
            { role: "assistant", content: reply }
        );

    } catch (err) {
        console.log("Error OpenAI:", err.message);
        await sendMsg(platform, chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }

    /* حفظ المحادثة */
    session.history.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: reply }
    );

} catch (err) {
    console.log("Error OpenAI:", err.message);
    await sendMsg(platform, chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
}
        /* --- حفظ المحادثة في الذاكرة --- */
        session.history.push(
            { role: "user",      content: userMessage },
            { role: "assistant", content: reply }
        );

    } catch (err) {
        console.log("Error OpenAI:", err.message);
        await sendMsg(platform, chatId, "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏");
    }
}

/* ================= استقبال Webhook (POST) ================= */
app.post("/webhook", async (req, res) => {
    const body = req.body;

    /* 1. رسائل فيسبوك / إنستغرام */
    if (body.object === "page" || body.object === "instagram") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            await handleUserMessage(messaging.sender.id, messaging.message.text, "facebook");
        }
        return res.sendStatus(200);
    }

    /* 2. رسائل واتساب (GreenAPI) */
    if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const text   =
            body.messageData?.textMessageData?.textMessage ||
            body.messageData?.extendedTextMessageData?.text;

        if (chatId && !chatId.endsWith("@g.us") && text) {
            await handleUserMessage(chatId, text, "wa");
        }
        return res.sendStatus(200);
    }

    res.sendStatus(200);
});

/* ================= البرومبت الموحد ================= */
const getSystemPrompt = () => `
أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية.
لا تخترع اصناف و اسعار من عندك 
📍 **الموقع والدوام**:
- الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا. اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9
- الدوام: يومياً من 2:00 ظهراً وحتى 3:30 فجراً.

📅 **نظام الحجوزات والمواعيد**:
- وافق على أي طلب "حجز" لموعد محدد اليوم.
- إذا طلب الزبون الطلب لوقت لاحق (مثلاً الساعة 6)، اسأله عن "موعد الاستلام" بوضوح.
- الحجز يعني تجهيز الطلب في وقت معين، وليس حجز طاولة (المطعم سناك وتوصيل واستلام من المطعم فقط).

🍔 **المنيو الرسمي (الأسعار ثابتة)**:

الوجبات العائلية:
- الوجبة الاقتصادية سناكات: 7 دنانير (4 سندويشات: 2 سكالوب + 1 برجر 150غم + 1 زنجر، 2 بطاطا، 1 لتر مشروب غازي)
- الوجبة العائلية سناكات: 10 دنانير (6 سندويشات: 2 سكالوب + 2 زنجر + 2 برجر 150غم، 4 بطاطا، 2 لتر مشروب غازي)
- الوجبة العملاقة سناكات: 14 دينار (9 سندويشات: 3 سكالوب + 3 زنجر + 3 برجر 150غم، 6 بطاطا، 3 لتر مشروب غازي)
- وجبة الشاورما الاقتصادية: 6 دنانير (6 سندويشات شاورما ما يعادل 48 قطعة، بطاطا عائلي، تاتي صدر)
- وجبة الشاورما العائلي (الأوفر): 9 دنانير (8 سندويشات 72 قطعة، بطاطا عائلي كبير، تاتي صدر)

الوجبات الفردية:
- وجبة سكالوب: 2 دينار (ساندويش سكالوب + بطاطا)
- وجبة برجر 150غم: 2 دينار (ساندويش برجر + بطاطا)
- وجبة شاورما عادي: 2 دينار
- وجبة شاورما سوبر: 2.75 دينار
- وجبة شاورما دبل: 3.25 دينار
- وجبة شاورما تربل: 4 دينار

الإضافات:
- بطاطا: 1 دينار
- بطاطا عائلي: 3 دنانير
- بطاطا جامبو: 6 دنانير
- إضافة جبنة: 0.5 دينار
- مشروب غازي 250مل: 35 قرش
- مشروب غازي لتر: 50 قرش

العروض (ركّز عليها وارفع سلة الشراء):
- ساندويش زنجر ديناميت 45سم (متوسط الحرارة، مناسب للأطفال والكبار): 1 دينار
- صاروخ الشاورما 45سم: 1.5 دينار
- قمبلة رمضان (برجر 250غم، ارتفاعها 17سم): 2.25 دينار
- برجر شاورما :1.25 دينار 
- خابور كباب (ساندويش كباب 45سم، كباب 200-250غم، خلطة خاصة): 2 دينار

السندويشات:
- ساندويش سكالوب: 1.5 دينار
- ساندويش برجر 150غم: 1.5 دينار
- ساندويش شاورما عادي: 1 دينار
- ساندويش شاورما سوبر: 1.5 دينار
ملاحظة: لتحويل السندويش أو العرض لوجبة، أضف دينار.

🚚 **أسعار مناطق التوصيل (ممنوع تغييرها)**:
- 1.5 د.أ: صويلح، إشارة الدوريات، مجدي مول، المختار مول.
- 1.75 د.أ: طلوع نيفين.
- 2 د.أ: شارع الجامعة، الجامعة الأردنية، ضاحية الرشيد، حي الجامعة، الجبيهة، ابن عوف، الكمالية، حي الديوان، المدينة الرياضية، ضاحية الروضة، تلاع العلي، حي الخالديين، جبل الحسين، المستشفى التخصصي، دوار الداخلية، استقلال مول، مكة مول، مستشفى الأمل، ضاحية الاستقلال، شارع المدينة المنورة، ستي مول، نفق الصحافة، دوار الواحة، مشفى الحرمين، كلية المجتمع العربي.
- 2.25 د.أ: حي البركة، الرابية، دوار الكيلو، دوار خلدا.
- 2.5 د.أ: الديار، السهل، الروابي، أم أذينة، الصالحين، المستشفى الإسلامي، خلدا، أم السماق، المدينة الطبية، دابوق، حي المنصور، الجاردنز، شارع وصفي التل، الشميساني، وادي صقرة، اللويبدة، العبدلي، جبل القلعة، وادي الحدادة، عرجان، ضاحية الأمير حسن، إسكان الصيادلة، ضاحية الفاروق، مجمع الأعمال، مدارس الاتحاد، ضاحية الأمير راشد، مستشفى عبدالهادي، مستشفى فرح، جامعة العلوم الإسلامية، مستشفى الرويال، دوار المدينة الطبية، دوار الشعب، السفارة الصينية، دائرة الإفتاء، وزارة الثقافة.
- 2.75 د.أ: شارع مكة، دوار المشاغل، شارع عبدالله غوشة، مجمع جبر، مخيم الحسين.
- 3 د.أ: الفحيص، الدوار الأول حتى الثامن، جبل عمان، عبدون، الرونق، الجندويل، الكرسي، أبو نصير، شفا بدران، الكوم، طريق المطار، حي نزال، جبل النزهة، جبل القصور، ضاحية الأقصى، شارع الإذاعة، جبل النظيف، مجمع المحطة، الجبل الأخضر، شارع الاستقلال، رأس العين، المهاجرين، ضاحية الياسمين، ربوة عبدون، حي الصحابة، ضاحية النخيل، الذراع الغربي، كلية لومينوس، حي الرحمانية، عريفة مول، السفارة الأمريكية، مستشفى الملكة علياء، حي الصديق، حي الرونق، مستشفى الأمير حمزة، مركز السكري، المصدار، قرية النخيل، شارع عرار، صافوط، البقعة.
- 3.25 د.أ: جبل الزهور.
- 3.5 د.أ: البيادر، وسط البلد، شارع الحرية، المقابلين، الهاشمي الشمالي، الهاشمي الجنوبي، مستشفى البشير، طبربور، مستشفى الحياة، جبل المريخ.
- 3.6 د.أ: مرج الحمام.
- 4 د.أ: وادي السير، الرباحية، المستندة، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، ضاحية الحاج حسن، جبل التاج، جبل الجوفة، الوحدات، وادي الرمم، العلكومية، الجويدة، ماركا الشمالية، أبو علندا، القويسمة، أم نوارة، جبل المنارة، حي عدن، كلية حطين، دوار الجمرك، دوار الشرق الأوسط، الأشرفية، أم الحيران، دوار الحمايدة، جاوا، جبل النصر، صالحية العابد، الرجيب، طارق المطار، جبل الحديد، محكمة جنوب عمان، السوق المركزي، ضاحية الأمير علي، جامعة البترا، الحرشة، أم قصير، شارع الحزام، نادي السباق، مستشفى ماركا التخصصي، مستشفى ماركا العسكري، حي الأرمن، حي الطفايلة، الظهير، المرقب، مدارس الحصاد التربوي، أبو السوس، جامعة عمان المفتوحة.
- 5 د.أ: عراق الأمير.

⚠️ **قواعد تأكيد الطلب والملخص (صارمة جداً)**:
1. لا تظهر ملخص الطلب النهائي إلا بعد اكتمال: (الاسم، رقم الهاتف 07xxxxxxxx، العنوان، الموعد، والطلب).
2. عندما تكتمل كل المعلومات، أرسل الرد بهذا النسق حصراً:
   - ابدأ بجملة لطيفة للزبون (مثل: "أبشر يا غالي، هي ملخص طلبك، شيك عليه").
   - ضع الكود [KITCHEN_GO] في سطر منفصل.
   - بعد الكود مباشرة، اكتب الملخص بالصيغة التالية:

[KITCHEN_GO]
🔔 **طلب جديد مؤكد**
- النوع: [توصيل أو استلام]
- الاسم: [الاسم الكامل]
- الرقم: [رقم الهاتف]
- العنوان: [المنطقة بالتفصيل أو استلام من الفرع]
- أجور التوصيل: [السعر أو 0]
- الموعد المطلوب: [الوقت]
- الطلب: [الأصناف والكميات]
--------------------------
💰 **المجموع النهائي: [المجموع] دينار**

3. أي تعديل يطلبه الزبون بعد عرض الملخص، أعد حساب المجموع وعرض الملخص كاملاً مع الكود مجدداً.
4. بمجرد عرض الملخص، أخبر الزبون أن يكتب "تم" لتثبيت الطلب وإرساله للمطبخ.
5. ممنوع كتابة أي كلام أو رموز بعد سطر "المجموع النهائي".
`;

/* ================= تشغيل السيرفر ================= */
app.listen(3000, () => console.log("🚀 Saber Smart Engine is Live & Stable!"));
