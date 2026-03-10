import express from "express";
import axios from "axios";
import fs from "fs";

const DATA_FILE = "./sessions_db.json";
const SESSIONS = {};

// تحميل البيانات عند التشغيل
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE);
        Object.assign(SESSIONS, JSON.parse(rawData));
    } catch (e) { console.log("Error loading sessions:", e.message); }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(SESSIONS));
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const app = express();
app.use(express.json());

const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    PAGE_TOKEN: process.env.PAGE_TOKEN,
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ================= 2. البرومبت يبقى كما هو ================= */
const getSystemPrompt = () => {
    return `أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية... `;
    📅 **نظام الحجز (Reservations)**:
- مسموح للزبون يحجز طاولة أو يطلب تجهيز طلب لموعد معين.
- المتطلبات الإجبارية للحجز: (الاسم، رقم التلفون، الموعد/الساعة، عدد الأشخاص أو الطلب).
- عند اكتمال البيانات، أرسل الكود [RESERVATION_GO] متبوعاً بالتفاصيل.
- الصيغة للمطبخ:
  [RESERVATION_GO]
  🗓️ حجز جديد مؤكد!
  الاسم: [الاسم]
  الموعد: [الساعة واليوم]
  التفاصيل: [عدد الأشخاص أو الطلب المسبق]
`
أنت "صابر"، المساعد الذكي لمطعم (صابر جو سناك).
- **قاعدة اللغة الإجبارية**: إذا خاطبك الزبون باللغة العربية، أجب بالعامية الأردنية اللطيفة (يا غالي، أبشر، نورت).
- **English Support**: If the customer speaks in English, you must respond professionally and fluently in English, while maintaining the same friendly "Saber" personality.
- احسب المجموع دائماً بغض النظر عن اللغة.
- التزم بقائمة الأسعار والتوصيل نفسها.
- لا تمسح الذاكره بعد اخذ الطلب بل ابقى معه في الطلب في حالى قام باي تحديث 
- يوجد حجز لمواعيد استلام و التوصيل 
- المطعم فقط استلام او توصيل لا يوجد صالة 
📍 **Location**: Amman - University of Jordan St.
⏰ **Hours**: 2:00 PM - 3:30 AM.
... (باقي المنيو والتوصيل كما هي)
`;
};
أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان.
أنت نشمي، خدوم، وتستخدم اللهجة الأردنية اللطيفة (مثل: "أبشر"، "يا غالي"، "على راسي").

📍 **معلومات الموقع**: 
- العنوان: عمان - شارع الجامعة الأردنية - طلوع هافانا.
- فرعنا الوحيد: لا يوجد فروع أخرى.
- لوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9

⏰ **ساعات الدوام**: من 2:00 ظهراً حتى 3:30 فجراً.
💰 **الدفع**: كاش، زين كاش، أو CliQ (0796893403).

🍔 **المنيو الرسمي (أسعار بالدينار)**:
1. **عروض التوفير (الأكثر طلباً)**:
   - ساندويش ديناميت (45 سم): 1 د.أ
   - صاروخ شاورما (45 سم): 1.5 د.أ
   - قنبلة رمضان (برجر 250 جرام): 2.25 د.أ
   - خابور كباب (45 سم - 250غم كباب): 2 د.أ
   - (لتحويل أي ساندويش أو عرض لوجبة مع بطاطا وبيبسي أضف 1 دينار).

2. **الوجبات العائلية**:
   - الاقتصادية (7 د.أ): 4 ساندويشات مشكلة + 2 بطاطا + 1 لتر بيبسي.
   - العائلية (10 د.أ): 6 ساندويشات مشكلة + 4 بطاطا + 2 لتر بيبسي.
   - العملاقة (14 د.أ): 9 ساندويشات مشكلة + 6 بطاطا + 3 لتر بيبسي.
   - وجبة شاورما اقتصادية (6 د.أ): 6 ساندويشات (48 قطعة) + بطاطا عائلي.
   - وجبة شاورما أوفر (9 د.أ): 8 ساندويشات (72 قطعة) + بطاطا عائلي كبير.

3. **الوجبات الفردية والسندويشات**:
   - وجبات (سكالوب، زنجر، برجر 150غم): 2 د.أ (الساندويش وحده بـ 1.5).
   - وجبات الشاورما: عادي (2 د.أ)، سوبر (2.75 د.أ)، دبل (3.25 د.أ)، تربل (4 د.أ).
   - ساندويش شاورما: عادي (1 د.أ)، سوبر (1.5 د.أ).

🚚 **قائمة مناطق التوصيل الكاملة (بالدينار)**:
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

`
⚠️ **تعليمات إرسال الطلب للمطبخ (إجباري)**:
بمجرد تأكيد الطلب، أرسل الكود [KITCHEN_GO] متبوعاً بهذا القالب حرفياً:

[KITCHEN_GO]
🔔 **طلب جديد مؤكد**
- **الاسم**: [اسم الزبون]
- **الرقم**: [رقم الهاتف]
- **العنوان**: [المنطقة بالتفصيل]
- **الطلب**: [الأصناف المطلوبة]
- **الحساب**: [سعر الأكل] + [التوصيل]
- **المجموع الكلي**: [الحساب النهائي] دينار

الملاحظة: التجهيز خلال 30-45 دقيقة.
};

/* ================= 3. دوال الإرسال ================= */
async function sendFB(psid, message) {
    try {
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

/* ================= 4. العقل المدبر (التعديل الجوهري) ================= */
async function handleUserMessage(chatId, userMessage, platform = "wa", senderName = "يا غالي") {
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    }
    const session = SESSIONS[chatId];
    const msgClean = userMessage.trim().toLowerCase();

    // 1. فحص التأكيد (تم)
    const isConfirmation = /^(تم|تمام|أكد|تاكيد|اعتمد|وصل|ok|done)$/i.test(msgClean);
    
    if (isConfirmation && session.lastKitchenMsg) {
        console.log("إرسال للمطبخ...");
        await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
        
        const confirmMsg = `أبشر يا ${senderName}، طلبك صار عند الشباب بالمطبخ! نورت صابر جو 🙏`;
        platform === "facebook" ? await sendFB(chatId, confirmMsg) : await sendWA(chatId, confirmMsg);
        
        session.lastKitchenMsg = null; 
        session.history = []; // تصفير المحادثة بعد اكتمال الطلب لضمان بداية جديدة
        saveData();
        return;
    }

    // 2. معالجة الذكاء الاصطناعي
    try {
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini", 
            messages: [
                { role: "system", content: getSystemPrompt() + `\n اسم الزبون: ${senderName}` },
                ...session.history.slice(-10),
                { role: "user", content: userMessage }
            ],
            temperature: 0.5
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

        let reply = aiResponse.data.choices[0].message.content;

        if (reply.includes("[KITCHEN_GO]")) {
            const parts = reply.split("[KITCHEN_GO]");
            session.lastKitchenMsg = parts[1].trim(); 
            const finalReply = parts[0].trim() + "\n\nاكتب 'تم' للتأكيد وإرسال الطلب للمطبخ ✅";
            platform === "facebook" ? await sendFB(chatId, finalReply) : await sendWA(chatId, finalReply);
        } else {
            // إذا العميل لسه ما خلص بياناته، لا تمسح الـ lastKitchenMsg القديم إلا إذا غير الطلب جذرياً
            platform === "facebook" ? await sendFB(chatId, reply) : await sendWA(chatId, reply);
        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        if (session.history.length > 12) session.history = session.history.slice(-12);
        saveData(); 

    } catch (err) {
        console.error("AI Error:", err.message);
    }
}

/* ================= 5. Webhook (حل مشكلة التوقف) ================= */
app.get("/webhook", (req, res) => {
    res.status(200).send(req.query["hub.challenge"]);
});

app.post("/webhook", (req, res) => {
    // الرد الفوري "200 OK" يمنع تكرار الرسائل وتوقف الواتساب
    res.sendStatus(200); 

    const body = req.body;

    // تشغيل المعالجة في الخلفية بدون await عشان ما نعلق السيرفر
    if (body.object === "page" || body.object === "instagram") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            handleUserMessage(messaging.sender.id, messaging.message.text, "facebook", "يا غالي");
        }
    } 
    else if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const senderName = body.senderData?.senderName || "يا غالي";
        let messageContent = "";

        if (body.messageData?.typeMessage === "textMessage") {
            messageContent = body.messageData.textMessageData.textMessage;
        }

        if (chatId && !chatId.endsWith("@g.us") && messageContent) {
            handleUserMessage(chatId, messageContent, "wa", senderName);
        }
    }
});

app.listen(3000, () => console.log("Saber Engine is Live & Stable!"));
