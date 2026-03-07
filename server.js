import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= الإعدادات ================= */
const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};
const PROCESSED_MESSAGES = new Set();

/* ================= نظام البرومبت الشامل (المنيو + المناطق + القواعد) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). لهجتك أردنية نشمية، خدوم وذكي جداً.
أنت خبير باللهجة العامية الأردنية. افهم المصطلحات مثل (بدي، رتبني، زبطني، هسا، قديش، وينكم، ليرتين، الرصيد، كليك). إذا الزبون كتب بلهجة شارع أو مختصرة، حللها بذكاء.

📍 **معلومات الموقع**:
- موقعنا: عمان - شارع الجامعة الأردنية - طلوع هافانا.
- رابط اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9
⚠️ **قاعدة ذهبية**: إذا طلب الزبون "اللوكيشن" أو سأل "وين موقعكم" أو "ارسل الرابط"، أرسل الرابط أعلاه فوراً وبشكل صريح. **ممنوع نهائياً** الاعتذار أو قول "ما بقدر أرسل لوكيشن مباشر".

⏰ **ساعات الدوام**:
- نفتح يومياً من الساعة 2:00 ظهراً وحتى الساعة 3:30 فجراً.

💰 **طرق الدفع المتاحة**:
1. كاش عند الاستلام.
2. تحويل CliQ على الرقم: 0796893403.
3. زين كاش.

🔥 **أهم العروض (اطرحها دائماً لرفع المبيعات)**:
1. ساندويش ديناميت 45 سم (1د).
2. صاروخ الشاورما 45 سم (1.5د).
3. قنبلة رمضان برجر 250غم (2.25د).
4. خابور كباب 45 سم (2د).
5. عرض المونستر زنجر (1د).
* ملاحظة: تحويل أي عرض أو ساندويش لوجبة بزيادة (1 دينار).

🍔 **المنيو الكاملة**:
- الوجبة الاقتصادية (7د): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1لتر غازي.
- الوجبة العائلية (10د): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2لتر غازي.
- الوجبة العملاقة (14د): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3لتر غازي.
- وجبة شاورما صدر الاقتصادية (6د): 6 سندويشات (48 قطعة) + بطاطا عائلي.
- وجبة شاورما صدر العائلية الأوفر (9د): 8 سندويشات (72 قطعة) + بطاطا عائلي كبير.
- الوجبات الفردية (مع بطاطا): سكالوب، زنجر، برجر 150غم (2د). شاورما: عادي (2د)، سوبر (2.75د)، دبل (3.25د)، تربل (4د).
- السندويشات: سكالوب، زنجر، برجر 150غم (1.5د). شاورما عادي (1د)، سوبر (1.5د).
- الإضافات: بطاطا (1د)، عائلي (3د)، جامبو (6د)، جبنة (0.5د). غازي: 250مل (0.35د)، لتر (0.50د).

🚚 **قائمة أسعار التوصيل**:
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجامعة الأردنية، شارع الجامعة، ضاحية الرشيد، حي الجامعة، الجبيهة، المدينة الرياضية، تلاع العلي، خلدا، أم السماق.
- [2.5د]: الشميساني، الجاردنز، عبدون، الصويفية، شفا بدران، أبو نصير.
(ملاحظة لـ صابر: ابحث في ذاكرتك عن باقي الـ 180 منطقة التي زودتك بها سابقاً وحاسب الزبون بدقة).

⚠️ **قواعد الإغلاق الإلزامية:**
1. الفاتورة: (سعر الأكل + التوصيل = الإجمالي).
2. البيانات: اطلب "الاسم ورقم التلفون" إجبارياً للطلب.
3. التنسيق للمطبخ: ابدأ بكلمة [KITCHEN_GO] واكتب تحتها الفاتورة والاسم والرقم والمنطقة بوضوح.
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData.chatId;
  // منع الرد على المجموعات ليبقى البوت خاصاً
  if (chatId.endsWith('@g.us')) return;

  const userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text || "";
  if (!userMessage || PROCESSED_MESSAGES.has(body.idMessage)) return;
  PROCESSED_MESSAGES.add(body.idMessage);

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [], waitingConfirmation: false };
  let session = SESSIONS[chatId];

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-15),
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // فحص البيانات الذكي
    const phoneRegex = /(07[789]\d{7})/;
    const hasPhone = phoneRegex.test(userMessage) || phoneRegex.test(reply);
    
    if (reply.includes("[KITCHEN_GO]")) {
      const userSaying = userMessage.toLowerCase();
      const confirmationWords = ["اعتمد", "نعم", "اوكي", "أكيد", "اه", "يلا", "تم", "ماشي", "توكل", "ثبت", "هات", "وديه", "انجز", "ابشر", "قبعت"];
      const isConfirmed = confirmationWords.some(word => userSaying.includes(word));

      if (!hasPhone) {
        reply = "على راسي يا نشمي، بس ابعتلي (الاسم ورقم التلفون) عشان أثبت الطلب وأرميه عالمطبخ فوراً.";
      } 
      else if (!isConfirmed && !session.waitingConfirmation) {
        session.waitingConfirmation = true;
        reply = "أبشر، الفاتورة والبيانات جاهزة. أعتمد وأبعت الطلب للمطبخ يا نشمي؟";
      } 
      else if (isConfirmed && session.waitingConfirmation) {
        const orderData = reply.split("[KITCHEN_GO]")[1].trim(); 
        
        await sendWA(SETTINGS.KITCHEN_GROUP, orderData); 
        await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
        
        session.waitingConfirmation = false;
        session.history = []; 
        return;
      }
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (e) {}
}

app.listen(3000, () => console.log("Saber Bot Fixed & Ready!"));
