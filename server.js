import express from "express";
import axios from "axios";
import fs from "fs";
const DATA_FILE = "./sessions_db.json";

// دالة لحفظ البيانات بلمح البصر
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(SESSIONS));
}

// دالة لتحميل البيانات أول ما يشتغل السيرفر
if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE);
    Object.assign(SESSIONS, JSON.parse(rawData));
}
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
app.use(express.json());

/* ================= 1. الإعدادات الأساسية ================= */
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    PAGE_TOKEN: process.env.PAGE_TOKEN,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= 2. نظام البرومبت المطور (صابر) ================= */
const getSystemPrompt = () => {
    return `أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية.
📍 **الموقع والدوام**:
- الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا. اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9.
- الدوام: يومياً من 2:00 ظهراً وحتى 3:30 فجراً.

📅 **نظام الحجوزات والمواعيد**:
- وافق على أي طلب "حجز" لموعد محدد اليوم.
- إذا طلب الزبون الطلب لوقت لاحق (مثلاً الساعة 6)، اسأله عن "موعد الاستلام" بوضوح.
- الحجز يعني تجهيز الطلب في وقت معين، وليس حجز طاولة (المطعم سناك وتوصيل و استلام من المطعم فقط).
ا🍔 **المنيو الرسمي (الأسعار ثابتة)**:
الوجبات العائلية 
الوجبة الاقتصادية  سناكات 7 دنانير تحتوي على 4 سندويشات 2 سكالوب و 1 برجر 150 غم 1 زنجر و 2 بطاطا و 1 لتر مشروب غازي 
الوجبة العائلية سناكات 10 دنانير 6 تحتوي على 6 سندويشات 2 سكالوب 2 زنجر 2 برجر 150 غم 4 بطاطا 2 لتر مشروب غازي 
الوجبة العملاقة سناكات 14 دينار تحتوي على 9 سندويشات 3 سكالوب 3 زنجر 3 برجر 150 جرام 6 بطاطا 3 لتر مشروب غازي 
وجبة الشاورما الاقتصادية 6 دنانير تحتوي  6 سندويشات شورما ما يعادل 48 قطعه بطاطا عائلي  تائتي  صدر  
وجبة الشاورما العائلي ( الاوفر) 9 دنانير 8 سندويشات 72 قطعه  و بطاطا عائلي كبير  تائتي ب صدر
الوجبات الفردية 
وجبة سكالوب ساندويش سكالوب و بطاطا 2 دينار 
وجبة برجر 150 غم ساندويش برجر و بطاطا 2 دينار 
وجبة شاورما عادي 2  دينار 
وجبة شاورما سوبر  2.75 دينار 
وجبة شاورما دبل 3.25 دينار 
وجبة شاورما تربل 4 دينار 
الاضافات 
بطاطا 1 دينار 
بطاطا عائلي 3 نانير 
بطاطا جامبو 6 دنانير 
اضفة جبنة 0.5 دينار 
مشروب غازي 250  مل 35 قرش 
مشروب غازي لتر 50 قرش 
العروض الي نركز عليها اكتر شي و نرفع منها سلة الشراء 
ساندويش زنجر ديناميت 45 سم متوسط الحرارة مناسب للاطفال و الكبار 1 دينار 
صاروخ الشاورما 45 سم 1.5 دينار 
برجر شاورما 1.25 دينار 
قمبلة رمضان ( برجر 250 جرام ) ارتفاعها 17 سم تقريبا بسعر 2.25 
خابور كباب ساندويش كباب طول 45 سم يحتوي على كباب بوزن 200 الى 250 غم و خلصه خاصه بسعر 2 دينار 
الندويشات 
ساندويش  سكالوب 1.5
ساندويش  برجر لحمة 150 غم 1.5 
ساندويش شاورما عادي 1 دينار 
ساندويش شاورما سوبر 1.5 دينار 
ملاحطة لتحويل العروض و السندويشات الى وجبات ضيف دينار 
🚚 **أسعار مناطق التوصيل (ممنوع تغييرها)**:.
- **1.5 د.أ**: صويلح، إشارة الدوريات، مجدي مول، المختار مول.
- **1.75 د.أ**: طلوع نيفين.
- **2 د.أ**: شارع الجامعة، الجامعة الأردنية، ضاحية الرشيد، حي الجامعة، الجبيهة، ابن عوف، الكمالية، حي الديوان، المدينة الرياضية، ضاحية الروضة، تلاع العلي، حي الخالديين، جبل الحسين، المستشفى التخصصي، دوار الداخلية، استقلال مول، مكة مول، مستشفى الامل، ضاحية الاستقلال، شارع المدينة المنورة، ستي مول، نفق الصحافة، دوار الواحة، مشفى الحرمين، كلية المجتمع العربي.
- **2.25 د.أ**: حي البركة، الرابية، دوار الكيلو، دوار خلدا.
- **2.5 د.أ**: الديار، السهل، الروابي، ام اذينة، الصالحين، المستشفى الإسلامي، خلدا، ام السماق، المدينة الطبية، دابوق، حي المنصور، الجاردنز، شارع وصفي التل، الشميساني، وادي صقرة، اللويبدة، العبدلي، جبل القلعة، وادي الحدادة، عرجان، ضاحية الامير حسن، اسكان الصيادلة، ضاحية الفاروق، مجمع الاعمال، مدارس الاتحاد، ضاحية الامير راشد، مستشفى عبدالهادي، مستشفى فرح، جامعة العلوم الاسلامية، مستشفى الرويال، دوار المدينة الطبية، دوار الشعب، السفارة الصينية، دائرة الافتاء، وزارة الثقافة.
- **2.75 د.أ**: شارع مكة، دوار المشاغل، شارع عبدالله غوشة، مجمع جبر، مخيم الحسين.
- **3 د.أ**: الفحيص، الدوار الأول، الثاني، الثالث، الرابع، الخامس، السادس، السابع، الثامن، جبل عمان، عبدون، الرونق، الجندويل، الكرسي، ابو نصير، شفا بدران، الكوم، طريق المطار، حي نزال، جبل النزهه، جبل القصور، ضاحية الاقصى، شارع الاذاعة، جبل النظيف، مجمع المحطة، الجبل الاخضر، شارع الاستقلال، رأس العين، المهاجرين، ضاحية الياسمين، ربوة عبدون، حي الصحابة، ضاحية النخيل، الذراع الغربي، كلية لومينوس، حي الرحمانية، عريفة مول، السفارة الامريكية، مستشفى الملكة علياء، حي الصديق، حي الرونق، مستشفى الامير حمزة، مركز السكري، المصدار، قرية النخيل، شارع عرار، صافوط، البقعة.
- **3.25 د.أ**: جبل الزهور.
- **3.5 د.أ**: البيادر، وسط البلد، شارع الحرية، المقابلين، الهاشمي الشمالي، الهاشمي الجنوبي، مستشفى البشير، طبربور، مستشفى الحياة، جبل المريخ.
- **3.6 د.أ**: مرج الحمام.
- **4 د.أ**: وادي السير، الرباحية، المستندة، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، ضاحية الحاج حسن، جبل التاج، جبل الجوفة، الوحدات، وادي الرمم، العلكومية، الجويدة، ماركا الشمالية، ابو علندا، القويسمة، ام نوارة، جبل المنارة، حي عدن، كلية حطين، دوار الجمرك، دوار الشرق الاوسط، الاشرفية، ام الحيران، دوار الحمايدة، جاوا، جبل النصر، صالحية العابد، الرجيب، طارق المطار، جبل الحديد، محكمة جنوب عمان، السوق المركزي، ضاحية الامير علي، جامعة البترا، الحرشة، ام قصير، شارع الحزام، نادي السباق، مستشفى ماركا التخصصي، مستشفى ماركا العسكري، حي الارمن، حي الطفايلة، الظهير، المرقب، مدارس الحصاد التربوي، ابو السوس، جامعة عمان المفتوحة.
- **5 د.أ**: عراق الامير.

[... المنيو وأسعار التوصيل تبقى كما هي ...]

⚠️ **قواعد الإرسال للمطبخ (صارمة جداً)**:
1. لا ترسل كود [KITCHEN_GO] إلا بعد اكتمال: (الاسم، رقم الهاتف، العنوان/المنطقة، الموعد، وتفاصيل الطلب مع الحساب الإجمالي).
2. إذا نقص أي عنصر (مثلاً الموعد أو الاسم)، اطلبه من الزبون بلطف قبل عرض ملخص الطلب.
3. حساب المجموع الإجمالي = (سعر الأصناف + أجور التوصيل).
4. بعد كود [KITCHEN_GO]، يجب صياغة الرسالة كالتالي حصراً:
5. إذا سألك الزبون سؤالاً جانبياً (مثل الموقع، السعر، أو وقت الدوام) وكان هناك طلب لم يتم تأكيده بكلمة 'تم' بعد، أجب على سؤاله باختصار ثم ذكّره بلطف بضرورة كتابة 'تم' لإرسال طلبه للمطبخ."
6.إجباري: لا ترسل [KITCHEN_GO]  إلا إذا كتب الزبون رقم هاتفه بالأرقام. يمنع قبول كلمة 'نفس الرقم' أو 'عندكم'؛ يجب أن يكتب الرقمو يجب ان يكون رقم الهاتف من بلزبط  10 خانات و يبداء ب  07 (مثلاً 07xxxxxxxx) ليظهر في ملخص الطلب.
7.في حال الاستلام من الفرع: (الاسم، رقم الهاتف، الموعد، والطلب). (مهم: لا تطلب عنوان للاستلام).
بمجرد توفر هذه المعلومات، اعرض ملخص الطلب فوراً متبوعاً بكود [KITCHEN_GO].
[KITCHEN_GO]
7. طلبات الاستلام و التوصيل الاسم و رقم الهاتف اجباري 
🔔 طلب جديد مؤكد!
- النوع: [توصيل أو استلام]
- الاسم: [الاسم الكامل]
- الرقم: [رقم الهاتف]
- العنوان: [المنطقة بالتفصيل أو استلام من الفرع]
- اجور التوصيل: [السعر من القائمة أو 0 للاستلام]
- الموعد المطلوب: [الوقت]
- الطلب: [الأصناف + الكميات]
- المجموع النهائي: [مجموع الساندويشات + التوصيل] دينار

إذا في أي تعديل، تواصل هاتفياً مع المطعم: 0796893403. شكراً لطلبك.

⚠️ قواعد صارمة للمطبخ:
- لا ترسل كود [KITCHEN_GO] إلا بعد اكتمال (الاسم، رقم الهاتف 07xxxxxxx، العنوان، الموعد، والطلب).
- في حال "استلام من الفرع"، لا تطلب عنواناً.
- نادي الزبون باسمه دائماً ليكون الحوار ودياً وغير مكرر (لمنع الحظر).
- بعد كود [KITCHEN_GO]، ضع ملخص الطلب بوضوح للشباب بالمطبخ.`;
};

/* ================= 3. دوال الإرسال ================= */
async function sendFB(psid, message) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
            recipient: { id: psid }, sender_action: "mark_seen"
        });
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
            recipient: { id: psid }, sender_action: "typing_on"
        });
        await delay(1500);
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
            recipient: { id: psid }, message: { text: message }
        });
    } catch (err) { console.log("FB Error:", err.message); }
}

async function sendWA(chatId, message) {
    try {
        await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, {
            chatId: chatId, message: message
        });
    } catch (err) { console.log("WA Error:", err.message); }
}

/* ================= 4. العقل المدبر (handleUserMessage) ================= */
async function handleUserMessage(chatId, userMessage, platform = "wa", senderName = "يا غالي") {
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    }
    const session = SESSIONS[chatId];

    const isConfirmation = /^(تم|تمام|ايوا|ok|أكد|تاكيد|اعتمد|وصل)$/i.test(userMessage.trim());
    
    // هاد الجزء صار يقرأ من الذاكرة المحفوظة بالملف
    if (isConfirmation && session.lastKitchenMsg) {
        await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        const confirmMsg = `أبشر يا ${senderName}، طلبك اعتمدناه وصار بالمطبخ! نورت صابر جو 🙏`;
        platform === "facebook" ? await sendFB(chatId, confirmMsg) : await sendWA(chatId, confirmMsg);
        
        session.lastKitchenMsg = null;
        saveData(); // حفظ التغيير فوراً
        return;
    }

    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini", 
            messages: [
                { role: "system", content: getSystemPrompt() + `\n العميل اسمه: ${senderName}.` },
                // تقليل الـ history لآخر 6 رسائل فقط لتوفير التكاليف (Tokens)
                ...session.history.slice(-6), 
                { role: "user", content: userMessage }
            ],
            temperature: 0.7 
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim(); 
            const finalReply = parts[0].trim() + "\n\nاكتب 'تم' للتأكيد ✅";
            platform === "facebook" ? await sendFB(chatId, finalReply) : await sendWA(chatId, finalReply);
        } else {
            platform === "facebook" ? await sendFB(chatId, reply) : await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        
        // تنظيف الذاكرة بشكل دوري وحفظها
        if (session.history.length > 10) session.history = session.history.slice(-10);
        saveData(); 

    } catch (err) {
        console.error("AI Error:", err.message);
    }
}
/* ================= 5. Webhooks المصلحة ================= */
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "SaberJo_Secret_2026";
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
    const body = req.body;

    // 1. معالجة فيسبوك وانستغرام
    if (body.object === "page" || body.object === "instagram") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            await handleUserMessage(messaging.sender.id, messaging.message.text, "facebook", "يا غالي");
        }
        return res.sendStatus(200); // إرسال رد واحد فقط والخروج
    }

    // 2. معالجة واتساب (GreenAPI)
    if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const senderName = body.senderData?.senderName || "يا غالي";
        
        let messageContent = "";

        if (body.messageData?.typeMessage === "textMessage") {
            messageContent = body.messageData.textMessageData.textMessage;
        } 
        else if (body.messageData?.typeMessage === "imageMessage") {
            messageContent = "[الزبون أرسل صورة، اسأله عن تفاصيل الطلب بالصورة]";
        }
        else if (body.messageData?.typeMessage === "quotedMessage" || body.messageData?.fileMessageData) {
            messageContent = "[الزبون أرسل فويس، اطلب منه كتابة الطلب نصاً]";
        }

        if (chatId && !chatId.endsWith("@g.us") && messageContent) {
            await handleUserMessage(chatId, messageContent, "wa", senderName);
        }
        return res.sendStatus(200); // إرسال رد واحد فقط والخروج
    }

    // لضمان عدم بقاء الطلب معلقاً
    if (!res.headersSent) {
        res.sendStatus(200);
    }
});

app.listen(3000, () => console.log("Saber Engine is Live & Stable!"));
