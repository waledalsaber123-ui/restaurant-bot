import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());
/* Facebook webhook verification */
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "SaberJo_Secret_2026";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});
const SETTINGS = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    PAGE_TOKEN: process.env.PAGE_TOKEN, // 👈 هاد السطر ضروري ضيفه هون
    KITCHEN_GROUP: "120363407952234395@g.us",
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
async function handleUserMessage(chatId, userMessage, platform="wa") {

    if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], lastKitchenMsg: null };
    const session = SESSIONS[chatId];

if (/^(تم|تمام|ايوا|ok|أكد|تاكيد|اوكي|خلص|تمامم)$/i.test(userMessage.trim()) && session.lastKitchenMsg) {

    await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);

    if (platform === "facebook") {
        await sendFB(chatId, "أبشر يا غالي، طلبك وصل للمطبخ 🙏");
    } else {
        await sendWA(chatId, "أبشر يا غالي، طلبك وصل للمطبخ 🙏");
    }

    session.lastKitchenMsg = null;
    return;
}
    try {

        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [
                { role: "system", content: getSystemPrompt() },
                ...session.history.slice(-18),
                { role: "user", content: userMessage }
            ],
            temperature: 0
        }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }});

        let reply = aiResponse.data.choices[0].message.content;
// إذا ظهر ملخص الطلب ولم يظهر KITCHEN_GO
if (reply.includes("طلب جديد") || reply.includes("ملخص")) {

  session.lastKitchenMsg = reply;

  const confirmMsg =
  reply +
  "\n\nلتأكيد الطلب اكتب كلمة: تم ✅";

  if (platform === "facebook") {
    await sendFB(chatId, confirmMsg);
  } else {
    await sendWA(chatId, confirmMsg);
  }

  return;
}
if (reply.includes("[KITCHEN_GO]")) {

  const parts = reply.split("[KITCHEN_GO]").filter(Boolean);

const parts = reply.split("[KITCHEN_GO]");
session.lastKitchenMsg = parts[1]?.trim();
  const finalReply = parts[0].trim() + "\n\nاكتب تم للتأكيد ✅";

  platform === "facebook"
    ? await sendFB(chatId, finalReply)
    : await sendWA(chatId, finalReply);

}
              if (session.lastKitchenMsg && /^(حالا|هلاء|تمام|اوكي)$/i.test(userMessage.trim())) {

  await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);

  await sendWA(chatId, "تم اعتماد الطلب وإرساله للمطبخ 🔥");

  session.lastKitchenMsg = null;
}


        } else {

            if(platform === "facebook"){
                await sendFB(chatId, reply);
            }else{
                await sendWA(chatId, reply);
            }

        }

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

    } catch (err) {
        console.log(err.message);
    }
}
/* ================= نظام البرومبت الموحد والشامل ================= */
const getSystemPrompt = () => {
    return `
أنت "صابر"، المسؤول عن الطلبات في مطعم (صابر جو سناك) في عمان. شخصيتك نشمية، خدومة، وبتحكي بلهجة أردنية.

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
صاروخ الشاورما 45 سم الى 50 سم  1.5 دينار 
برجر الشاورما 1.25 دينار  
قمبلة رمضان ( برجر 250 جرام ) ارتفاعها 17 سم تقريبا بسعر 2.25 
خابور كباب ساندويش كباب طول 45 سم يحتوي على كباب بوزن 200 الى 250 غم و خلصه خاصه بسعر 2 دينار 
الساندويشات
ساندويش سكالوب 1.5 دينار
ساندويش برجر لحمة 150 غم 1.5 دينار
ساندويش شاورما عادي 1 دينار
ساندويش شاورما سوبر 1.5 دينار
برجر شاورما 1.25 دينار
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

⚠️ قواعد إرسال الطلب للمطبخ (مهم جداً)

1. لا تستخدم كود [KITCHEN_GO] إلا بعد اكتمال معلومات الطلب.

المعلومات المطلوبة:

للتوصيل:
- الاسم
- رقم الهاتف (10 خانات يبدأ بـ 07)
- المنطقة
- الموعد
- تفاصيل الطلب

للاستلام من الفرع:
- الاسم
- رقم الهاتف (10 خانات يبدأ بـ 07)
- الموعد
- تفاصيل الطلب
(لا تطلب عنوان في حالة الاستلام)
و اذا العميل قام بطلب استلام خد منه التاكيد مباشره مع شرح تفاصيل طلبو و رسله للمطبخ [KITCHEN_GO]
 
2. إذا كانت أي معلومة ناقصة اسأل الزبون عنها بلطف.

3. إذا قال الزبون:
حالا / هلاء / الآن / بعد ساعة / بعد نص ساعة
اعتبرها موعد صالح للطلب.

4. بمجرد اكتمال المعلومات التالية:
الاسم + رقم الهاتف + الموعد + الطلب

اعرض ملخص الطلب فقط.

ثم اطلب من العميل تأكيد الطلب بكتابة "تم".

لا تستخدم [KITCHEN_GO] قبل تأكيد العميل.

ثم اطلب من العميل تأكيد الطلب بكتابة "تم".

لا تستخدم [KITCHEN_GO] قبل تأكيد العميل.
5. صيغة رسالة المطبخ يجب أن تكون هكذا فقط:

🔔 طلب جديد مؤكد

- النوع: توصيل أو استلام
- الاسم: ...
- الرقم: ...
- العنوان: المنطقة أو "استلام من الفرع"
- اجور التوصيل: السعر أو 0 للاستلام
- الموعد المطلوب: ...
- الطلب: ...
- المجموع النهائي: ... دينار

إذا في أي تعديل تواصل هاتفياً مع المطعم:
0796893403
`;
};
app.post("/webhook", async (req, res) => {
    const body = req.body;

    // 1. إذا الرسالة من فيسبوك أو إنستغرام
    if (body.object === "page" || body.object === "instagram") {
        const messaging = body.entry?.[0]?.messaging?.[0];
        if (messaging?.message?.text) {
            await handleUserMessage(messaging.sender.id, messaging.message.text, "facebook");
        }
        return res.sendStatus(200);
    }

    // 2. إذا الرسالة من واتساب (GreenAPI)
    if (body.typeWebhook === "incomingMessageReceived") {
        const chatId = body.senderData?.chatId;
        const text = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
        
        if (chatId && !chatId.endsWith("@g.us") && text) {
            await handleUserMessage(chatId, text, "wa");
        }
        return res.sendStatus(200);
    }

    res.sendStatus(200);
});
 

const errMsg = "أبشر يا غالي، بس ارجع ابعث رسالتك كمان مرة، كان في ضغط عالخط 🙏";

  async function sendFB(psid, message) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${SETTINGS.PAGE_TOKEN}`, {
            recipient: { id: psid },
            message: { text: message }
        });
    } catch (err) {
        console.log("Error FB:", err.response?.data || err.message);
    }
}
  async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      {
        chatId: chatId,
        message: message
      }
    );
  } catch (err) {
    console.log("Error WA:", err.response?.data || err.message);
  }
}

app.listen(3000, () => console.log("Saber Smart Engine is Live & Stable!"));

