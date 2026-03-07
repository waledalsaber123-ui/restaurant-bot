import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  RESTAURANT_PHONE: "0796893403",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت (المناطق كاملة + حجز الاستلام بالوقت) ================= */
const getSystemPrompt = () => {
  return `
 // أضف هذا النص داخل الـ System Prompt (التعليمات)
`// أضف هذا داخل الـ System Prompt
`
⚠️ **نظام التأكيد المزدوج والفاتورة**:
1. المرحلة الأولى: عند اكتمال الأصناف، أرسل للزبون "فاتورة مبدئية" بهذا الشكل:
   "طلبك هو: [الأصناف] بقيمة [السعر].
   أكدلي عشان آخذ منك (الاسم والرقم والعنوان) ونبعته للمطبخ؟"

2. المرحلة الثانية (التأكيد النهائي): لا تضع [KITCHEN_GO] إلا بعد الحصول على الاسم والرقم. 
   يجب أن يكون نص الرد بعد [KITCHEN_GO] مطابقاً لهذا التنسيق تماماً:
   🔔 طلب جديد!
   الاسم: [اسم الزبون]
   الرقم: [رقم الزبون]
   العنوان (أو استلام): [المنطقة أو كلمة استلام]
   الطلب: [تفاصيل الأصناف]
   سعر الأكل: [السعر]
   أجور التوصيل: [الأجر]
   الإجمالي: [المجموع الكلي]
`
🚫 **قاعدة الحظر الصارمة (إلزامي)**:
ممنوع نهائياً إرسال الكود [KITCHEN_GO] إلا إذا توفرت هذه البيانات كاملة:
1. **الأصناف**: (ماذا يريد أن يأكل؟).
2. **نوع الطلب**: (توصيل أو استلام).
3. **الموعد**: (متى يريد الطلب؟ اليوم، بكره، الساعة كذا؟).
4. **بيانات العميل**: (الاسم، المنطقة "إذا كان توصيل"، ورقم الهاتف).

إذا نقص أي بند، لا ترسل للمطبخ، بل اطلب البند الناقص بأدب ولهجة أردنية. 
مثال: "على راسي، بس أعطيني الاسم ورقم التلفون عشان أعتمد الطلب فوراً".
` `
⚠️ **تعليمات الاستمرارية ومنع نسيان الطلب**:
- إذا قام الزبون بتحديد أصناف الطعام ثم قال كلمة "بكره" أو "أكد" أو "اعتمد"، لا تبدأ التحية من جديد. 
- اعتبر كلمة "بكره" هي تحديد لموعد الاستلام للطلب الذي تم ذكره في الرسائل السابقة.
- اجمع الأصناف السابقة مع الموعد الجديد (بكره) وأرسل [KITCHEN_GO] فوراً.
`
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). 
⚠️ **قواعد العمل (إجبارية)**:
1. **حجز الاستلام**: لا ترفض الحجز أبداً. إذا طلب الزبون استلام، اسأله "أي ساعة حابب يكون طلبك جاهز؟" وثبّت الوقت في المطبخ.
2. **فهم الصور**: أي صورة عرض (مثل المونستر زنجر) أضفها فوراً بسعرها (1د).
3. **التوصيل**: التزم بأسعار المناطق أدناه حرفياً.

🍔 **المنيو الرسمي**:الوجبات العائلية 
الوجبة الاقتصادية  سناكات 7 دنانير تحتوي على 4 سندويشات 2 سكالوب و 1 برجر 150 غم 1 زنجر و 2 بطاطا و 1 لتر مشروب غازي 
الوجبة العائلية سناكات 10 دنانير 6 تحتوي على 6 سندويشات 2 سكالوب 2 زنجر 2 برجر 150 غم 4 بطاطا 2 لتر مشروب غازي 
الوجبة العملاقة سناكات 14 دينار تحتوي على 9 سندويشات 3 سكالوب 3 زنجر 3 برجر 150 جرام 6 بطاطا 3 لتر مشروب غازي 
وجبة الشاورما صدر الاقتصادية 6 دنانير تحتوي  6 سندويشات شورما ما يعادل 48 قطعه بطاطا عائلي  تائتي    
وجبة الشاورما صدر العائلي ( الاوفر) 9 دنانير 8 سندويشات 72 قطعه  و بطاطا عائلي كبير  تائتي ب صدر
الوجبات الفردية 
وجبة سكالوب ساندويش سكالوب و بطاطا 2 دينار 
وجبة زنجر ساندويش زنجر بطاطا 2 دينار 
وجبة برجر 150 غم ساندويش برجر و بطاطا 2 دينار 
وجبة شاورما عادي 2  دينار 
وجبة شاورما سوبر  2.75 دينار 
وجبة شاورما دبل 3.25 دينار 
وجبة شاورما تربل 4 دينار 
الاضافات 
بطاطا 1 دينار 
بطاطا عائلي 3 نانير 
بطاطا جامبو 6 دنانير 
اضفة جبنة 0.5 دينار 
مشروب غازي 250  مل 35 قرش 
مشروب غازي لتر 50 قرش 
العروض الي نركز عليها اكتر شي و نرفع منها سلة الشراء 
ساندويش ديناميت 45 سم متوسط الحرارة مناسب للاطفال و الكبار 1 دينار 
صاروخ الشاورما 45 سم 1.5 دينار 
قمبلة رمضان ( برجر 250 جرام ) ارتفاعها 17 سم تقريبا بسعر 2.25 
خابور كباب ساندويش كباب طول 45 سم يحتوي على كباب بوزن 200 الى 250 غم و خلصه خاصه بسعر 2 دينار 
الندويشات 
ساندويش  سكالوب 1.5
ساندويش  زنجر 1.5 
ساندويش  برجر 150 غم 1.5 
ساندويش شاورما عادي 1 دينار 
ساندويش شاورما سوبر 1.5 دينار 
ملاحطة لتحويل العروض و السندويشات الى وجبات ضيف دينار 
🚚 **قائمة مناطق التوصيل الكاملة (التزام تام بالأسعار)**:
- **[1.5د]**: صويلح، إشارة الدوريات، مجدي مول.
- **[2د]**: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- **[2.5د]**: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- **[3د]**: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- **[3.5د]**: البيادر، شارع الحرية، الهاشمي الشمالي، الهاشمي الجنوبي، طبربور، ضاحية الياسمين.
- **[4د]**: وادي السير، ماركا الشمالية، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، مرج الحمام، سحاب، طريق المطار (بعد جسر مادبا).

⚠️ **عند التأكيد (استلام أو توصيل)**:
أرسل [KITCHEN_GO] متبوعاً بـ:
- نوع الطلب + **وقت الاستلام المحدد**.
- ملخص الأصناف والمجموع.
- بيانات الزبون (الاسم، المنطقة، الرقم).
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived" && body.typeWebhook !== "incomingFileMessageReceived") return;

  const messageId = body.idMessage;
  if (PROCESSED_MESSAGES.has(messageId)) return;
  PROCESSED_MESSAGES.add(messageId);

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

 // قبل إرسال الرسالة لـ AI، تأكد أنك لا تصفر الذاكرة يدوياً
if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [] };
}
// لا تضع أي رسالة ترحيب تلقائية (Hardcoded) هنا، اترك الـ AI هو من يقرر بناءً على الذاكرة.
  let userMessage = "";
  if (body.messageData?.typeMessage === "textMessage" || body.messageData?.typeMessage === "extendedTextMessage") {
    userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text;
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData.fileMessageData.mimeType.includes("image")) {
    userMessage = await analyzeImage(body.messageData.fileMessageData.downloadUrl);
  }

  if (!userMessage) return;

  try {
  const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o",
    messages: [
        { role: "system", content: getSystemPrompt() },
        // تأكد من رفع الرقم هنا إلى 15 أو 20 رسالة
        ...session.history.slice(-20), 
        { role: "user", content: userMessage }
    ],
    temperature: 0 // صفر لضمان الدقة ومنع الاجتهاد
}, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    let reply = aiResponse.data.choices[0].message.content;
let reply = aiResponse.data.choices[0].message.content;

    // --- بداية التعديل الجديد ---
    if (reply.includes("[KITCHEN_GO]")) {
        // فحص وجود البيانات الأساسية (الاسم والرقم الأردني)
        const hasPhone = /(07[789]\d{7})/.test(reply) || reply.includes("07");
        const hasName = reply.includes("الاسم") && !reply.includes("[اسم الزبون]");

        if (!hasPhone || !hasName) {
            // إذا حاول البوت الإرسال والبيانات ناقصة، نجبره على طلبها
            reply = "على راسي يا غالي، بس يا ريت تبعتلي (الاسم ورقم التلفون) عشان أثبت الطلب وأبعته للمطبخ فوراً.";
        } else {
            // إذا البيانات كاملة، يتم الإرسال للمطبخ بالتنسيق اللي طلبته
            const orderDetails = reply.split("[KITCHEN_GO]")[1].trim();
            
            // إرسال لجروب المطبخ
            await sendWA(SETTINGS.KITCHEN_GROUP, orderDetails); 
            
            // إرسال تأكيد للزبون
            await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");

            // مسح الجلسة بعد 24 ساعة لضمان عدم نسيان "بكره"
            setTimeout(() => {
                if (SESSIONS[chatId]) delete SESSIONS[chatId];
            }, 86400000); 

            return; // إنهاء الدالة هنا لمنع إرسال الرد مرتين
        }
    }
    // --- نهاية التعديل الجديد ---

    // إرسال الرد العادي للزبون (سواء كان الفاتورة المبدئية أو طلب البيانات)
    await sendWA(chatId, reply);
    if (reply.includes("[KITCHEN_GO]")) {
      const finalOrder = reply.split("[KITCHEN_GO]")[1].trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, `✅ *طلب جديد مؤكد*:\n${finalOrder}`);
      await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
// داخل شرط if (reply.includes("[KITCHEN_GO]"))
if (reply.includes("[KITCHEN_GO]")) {
    const finalOrder = reply.split("[KITCHEN_GO]")[1].trim();
    await sendWA(SETTINGS.KITCHEN_GROUP, `✅ *طلب جديد مؤكد*:\n${finalOrder}`);
    await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");

    // تعديل المسح ليكون بعد 24 ساعة بدلاً من المسح الفوري
    // 86400000 مللي ثانية = 24 ساعة
    setTimeout(() => {
        if (SESSIONS[chatId]) {
            delete SESSIONS[chatId];
            console.log(`Session cleared for ${chatId} after 24 hours.`);
        }
    }, 86400000); 

    return; // إنهاء المعالجة هنا
}      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

/* ================= تحليل الصور ================= */
async function analyzeImage(url) {
  try {
    const res = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{ role: "user", content: [
        { type: "text", text: "استخرج الطلب من الصورة لشرائه فوراً بسعر المنيو." },
        { type: "image_url", image_url: { url: url } }
      ]}]
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });
    return `[الزبون اختار هذا العرض من الصورة]: ${res.data.choices[0].message.content}`;
  } catch (err) { return "صورة عرض"; }
}

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Complete Zones Live!"));
