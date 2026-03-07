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

/* ================= نظام البرومبت الشامل (بدون أي تعديل على المنيو) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). لهجتك أردنية نشمية، خدوم وذكي جداً.
أنت خبير باللهجة العامية الأردنية. افهم المصطلحات مثل (بدي، رتبني، زبطني، هسا، قديش، وينكم، ليرتين، الرصيد، كليك).

📍 **معلومات الموقع والتواصل**:
موقعنا: عمان - شارع الجامعة الأردنية - طلوع هافانا.
رابط اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9
⚠️ **قاعدة ذهبية**: إذا طلب الزبون "اللوكيشن" أو سأل "وين موقعكم" أو "ارسل الرابط"، أرسل الرابط أعلاه فوراً وبشكل صريح.

⏰ **ساعات الدوام**:
- نفتح يومياً من الساعة 2:00 ظهراً وحتى الساعة 3:30 فجراً.

💰 **طرق الدفع المتاحة**:
1. كاش عند الاستلام.
2. تحويل CliQ على الرقم: 0796893403.
3. زين كاش.

🔥 **قسم العروض**:
1. ساندويش ديناميت 45 سم (1د).
2. صاروخ الشاورما 45 سم (1.5د).
3. قنبلة رمضان (برجر 250 غم، ارتفاع 17 سم) بـ 2.25 دينار.
4. خابور كباب (45 سم، وزن 250 غم) بـ 2 دينار.
5. عرض المونستر زنجر بـ 1 دينار.
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

🚚 **قائمة أسعار التوصيل الكاملة:**
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول، كلية المجتمع العربي.
- [1.75د]: المختار مول، طلوع نيفين.
- [2د]: الجامعة الأردنية، شارع الجامعة، ضاحية الرشيد، حي الجامعة، الجبيهة، ابن عوف، المدينة الرياضية، ضاحية الروضة، تلاع العلي، حي الخالدين، جبل الحسين، المستشفى التخصصي، مستشفى الامل، دوار الداخلية، دوار الواحة، مشفى الحرمين، شارع المدينة المنورة، ستي مول، نفق الصحافة، مكة مول، حي الديوان، الكمالية.
- [2.25د]: حي البركة، الرابية، دوار الكيلو، دوار خلدا.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، الصالحين، المستشفى الإسلامي، خلدا، أم السماق، المدينة الطبية، شارع المدينة الطبية، دابوق، حي المنصور، الجاردنز، الشميساني، العبدلي، جبل القلعة، عرجان، استقلال مول، مجمع الاعمال، السفارة الامريكية، ابو نصير.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، الجندويل، الكرسي، شفا بدران، جامعة العلوم التطبيقية، مستشفى الاردن، طريق المطار، وسط البلد، صافوط، البقعة.
- [3.5د]: البيادر، حي نزال، شارع الحرية، المقابلين، الهاشمي، طبربور، مستشفى البشير.
- [4د]: وادي السير، ماركا، اليادوده، الوحدات، القويسمة، ابو علندا، الجويدة، ام نوارة.

⚠️ **قواعد الإغلاق الإلزامية:**
1. الفاتورة: (سعر الأكل + التوصيل = الإجمالي).
2. البيانات: اطلب "الاسم ورقم التلفون" إجبارياً.
3. المطبخ: استخدم [KITCHEN_GO] فقط عندما تكون مستعداً لإرسال الطلب النهائي للمطبخ.
`;
};

/* ================= المحرك الرئيسي ================= */
/* ================= المحرك الرئيسي - نسخة إصلاح الإرسال للمطبخ ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData.chatId;
  if (chatId.endsWith('@g.us')) return;

  const userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text || "";
  const now = Date.now();

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [], waitingConfirmation: false, lastActivity: now, pendingOrderData: null };
  }
  const session = SESSIONS[chatId];
  session.lastActivity = now;

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

    // فحص الهاتف والاسم
    const phoneRegex = /(07[789]\d{7})/;
    const hasPhone = phoneRegex.test(userMessage) || phoneRegex.test(reply) || session.history.some(m => phoneRegex.test(m.content));
    
    // كلمات التأكيد
    const confirmationWords = ["اعتمد", "نعم", "اوكي", "أكيد", "اه", "يلا", "تم", "ماشي", "توكل", "ثبت", "هات", "انجز", "توصيل", "أوك", "اوك"];
    const isConfirmed = confirmationWords.some(word => userMessage.toLowerCase().includes(word));

    // إذا البوت استخرج بيانات المطبخ
    if (reply.includes("[KITCHEN_GO]")) {
        // حفظ تفاصيل الطلب في الجلسة حتى لا تضيع
        session.pendingOrderData = reply.split("[KITCHEN_GO]")[1] || reply;
    }

    if (session.pendingOrderData) {
      // 1. فحص إذا كان نقص بيانات (اسم ورقم)
      if (!hasPhone) {
        reply = "على راسي، بس زودني بـ (الاسم ورقم التلفون) عشان أثبت الطلب وأرميه عالمطبخ فوراً.";
      } 
      // 2. إذا البيانات موجودة والزبون أكد (أو بعت الرقم وهو أصلاً بمرحلة التأكيد)
      else if (isConfirmed || (hasPhone && session.waitingConfirmation)) {
        
        let kitchenHeader = "✅ طلب جديد مؤكد:\n";
        if (userMessage.includes("استلام") || reply.includes("استلام")) kitchenHeader = "🏪 طلب استلام:\n";
        
        // الإرسال الفعلي للجروب
        await sendWA(SETTINGS.KITCHEN_GROUP, kitchenHeader + session.pendingOrderData.trim());
        
        // رد التأكيد للزبون
        reply = "أبشر يا نشمي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏";
        
        // تصفير حالة الانتظار والطلب المعلق
        session.waitingConfirmation = false;
        session.pendingOrderData = null;
      } 
      else {
        // حالة انتظار التأكيد
        session.waitingConfirmation = true;
        reply = reply.replace("[KITCHEN_GO]", "").trim();
        if (!reply.includes("أعتمد")) reply += "\n\nأعتمد الطلب وأبعته للمطبخ يا نشمي؟";
      }
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) { console.error("Error:", err.message); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (e) {}
}

app.listen(3000, () => console.log("Saber Bot - Fixed Logic Live!"));
