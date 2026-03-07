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
  REST_PHONE: "0796893403", // رقم المطعم للتواصل
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= نظام البرومبت الشامل ================= */
const SYSTEM_PROMPT = `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). لهجتك أردنية نشمية، خدوم وذكي جداً.
أنت خبير باللهجة العامية الأردنية. افهم المصطلحات مثل (بدي، رتبني، زبطني، هسا، قديش، وينكم، ليرتين، الرصيد، كليك).

⚠️ **قواعد العمل الصارمة**:
1. لا تقم باختلاق أسعار من عندك نهائياً. التزم بالمنيو المذكور فقط.
2. لا تقدم أي تعويضات أو خصومات أو وجبات مجانية من تلقاء نفسك.
3. عند إنهاء الطلب (عندما تتوفر كل البيانات)، يجب صياغته بالتنسيق التالي حصراً:
   شكرًا لك، [اسم الزبون]. إليك ملخص الطلب النهائي:
   - *الطلب*: (ذكر الوجبات)
   - *السعر*: (سعر الأكل)
   - *رسوم التوصيل*: (حسب المنطقة)
   - *المجموع الكلي*: (المجموع)
   - *الاسم*: (الاسم)
   - *الرقم*: (الرقم)
   - *العنوان*: (العنوان)
   سيتم توصيل الطلب خلال 30-45 دقيقة. شكرًا لاختيارك لنا! [KITCHEN_GO]

📍 **معلومات الموقع**: عمان - شارع الجامعة الأردنية - طلوع هافانا.
اللوكيشن: https://maps.app.goo.gl/NdFQY67DEnsWQdKZ9

⏰ **ساعات الدوام**: من 2:00 ظهراً وحتى 3:30 فجراً.

💰 **طرق الدفع**: كاش، CliQ (0796893403)، زين كاش.
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
`;

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  let currentText = body.messageData?.textMessageData?.textMessage || 
                body.messageData?.extendedTextMessageData?.text || "";
  let imageUrl = body.messageData?.fileMessageData?.downloadUrl || null;

  if (!chatId || chatId.includes("@g.us") || (!currentText && !imageUrl)) return;

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [], lastActive: Date.now() };
  }

  const session = SESSIONS[chatId];

  // تجهيز الرسالة الحالية (نص + صورة إن وجدت)
  let currentMessageContent = [];
  if (currentText) currentMessageContent.push({ type: "text", text: currentText });
  if (imageUrl) currentMessageContent.push({ type: "image_url", image_url: { url: imageUrl } });

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history.slice(-15), // تقليل الذاكرة لـ 15 رسالة لضمان السرعة وعدم الخطأ
        { role: "user", content: currentMessageContent }
      ],
      temperature: 0.2,
      max_tokens: 800 // تحديد الحد لضمان عدم انقطاع الرد
    }, {
      headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` },
      timeout: 25000 // زيادة وقت الانتظار لـ 25 ثانية
    });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const orderClean = reply.replace("[KITCHEN_GO]", "✅ *طلب جديد مؤكد*").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, orderClean);
      const finalMsg = `${orderClean}\n\n*ملاحظة:* لأي استفسار تواصل معنا على: ${SETTINGS.REST_PHONE}`;
      await sendWA(chatId, finalMsg);
      delete SESSIONS[chatId];
      return;
    }

    await sendWA(chatId, reply);
    
    // حفظ النصوص فقط في الذاكرة لتجنب ثقل البيانات
    session.history.push(
      { role: "user", content: currentText || "أرسل صورة" }, 
      { role: "assistant", content: reply }
    );

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    // إذا تكرر الخطأ، نقوم بتفريغ الذاكرة جزئياً لإراحة البوت
    session.history = session.history.slice(-2);
    await sendWA(chatId, "أبشر يا غالي، صار عندي ضغط بسيط. هسا صرت معك، شو كنت حابب تطلب؟ 🙏");
  }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) {}
}

app.listen(3000, () => console.log("Saber Bot Live & Professional!"));
