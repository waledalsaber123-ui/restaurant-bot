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

/* ================= نظام البرومبت (تم تحسينه لتقليل التوكنز وزيادة الدقة) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول الذكي عن الحجوزات في مطعم (صابر جو سناك). تتحدث بلهجة أردنية ترحيبية ومهذبة.

📍 معلومات الموقع والتواصل:
- العنوان: عمان - شارع الجامعة الأردنية - طلوع هافانا. (فرعنا الوحيد)
- لوكيشن: https://maps.app.goo.gl/NdFQY67DEnswQdKZ9
- الدوام: يومياً 2:00 ظهراً - 3:30 فجراً.
- الدفع: كاش عند الاستلام، كليك (0796893403)، أو زين كاش.

🍔 المنيو الرسمي:
* الوجبات العائلية:
- الاقتصادية (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر)، 2 بطاطا، 1 لتر مشروب غازي.
- العائلية (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم)، 4 بطاطا، 2 لتر مشروب غازي.
- العملاقة (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم)، 6 بطاطا، 3 لتر مشروب غازي.
- شاورما صدر الاقتصادية (6 دنانير): 6 سندويشات (48 قطعة)، بطاطا عائلي، تائتي.
- شاورما صدر العائلي الأوفر (9 دنانير): 8 سندويشات (72 قطعة)، بطاطا عائلي كبير، تائتي.

* الوجبات الفردية:
- وجبة سكالوب (2 دينار) / وجبة زنجر (2 دينار) / وجبة برجر 150غم (2 دينار)
- وجبة شاورما عادي (2 دينار) / سوبر (2.75 دينار) / دبل (3.25 دينار) / تربل (4 دينار)

* الإضافات:
- بطاطا (1 دينار) / عائلي (3 دنانير) / جامبو (6 دنانير)
- إضافة جبنة (0.5 دينار)
- مشروب 250 مل (35 قرش) / 1 لتر (50 قرش)

* العروض (اطرحها لرفع سلة الشراء):
- ساندويش ديناميت 45 سم (1 دينار)
- صاروخ الشاورما 45 سم (1.5 دينار)
- قنبلة رمضان برجر 250غم 17سم (2.25 دينار)
- خابور كباب 45 سم (2 دينار)

* السندويشات:
- سكالوب (1.5) / زنجر (1.5) / برجر 150غم (1.5) / شاورما عادي (1 دينار) / شاورما سوبر (1.5 دينار)
ملاحظة: لتحويل الساندويش لعرض وجبة ضف 1 دينار.

🚚 مناطق التوصيل (التزام تام بالأسعار):
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي الشمالي، الهاشمي الجنوبي، طبربور، ضاحية الياسمين.
- [4د]: وادي السير، ماركا الشمالية، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، مرج الحمام، سحاب، طريق المطار (بعد جسر مادبا).

⚠️ قواعد العمل الإجبارية:
1. الاستلام: لا ترفض الحجز. اسأل "أي ساعة حابب يكون طلبك جاهز؟". اعتبر كلمة "بكره" تحديد موعد للطلب السابق.
2. الصور: أي صورة عرض احسبها فوراً بـ (1 دينار).
3. التأكيد والفاتورة (المرحلة 1): عندما يطلب الزبون، أرسل فاتورة مبدئية: [الأصناف + أجور التوصيل إن وجد + الإجمالي]. ثم اسأله: "أكدلي الاسم ورقم التلفون عشان نعتمد الطلب؟".
4. إرسال الطلب للمطبخ (المرحلة 2): ممنوع استخدام الكود [KITCHEN_GO] إلا بعد التأكيد الصريح من الزبون وإعطائه الاسم ورقم هاتف أردني (يبدأ بـ 07).

عند اكتمال البيانات، يجب أن ترد بـ [KITCHEN_GO] متبوعاً بهذا التنسيق الحرفي تماماً:
[KITCHEN_GO]
🔔 طلب جديد مؤكد:
- *النوع*: [توصيل أو استلام مع الوقت]
- *الأصناف*: [تفاصيل الأصناف]
- *السعر*: [الإجمالي مع التوصيل]
- *الاسم*: [اسم الزبون]
- *المنطقة*: [منطقة التوصيل أو فرع الجامعة للاستلام]
- *الرقم*: [رقم الزبون]

إذا في أي تعديل، تواصل هاتفياً مع المطعم: 0796893403. شكراً لطلبك!
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

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [], timer: null };
  }
  
  let session = SESSIONS[chatId];

  // تصفير العداد لضمان بقاء الجلسة 24 ساعة من آخر رسالة
  if (session.timer) clearTimeout(session.timer);
  session.timer = setTimeout(() => {
      if (SESSIONS[chatId]) {
          delete SESSIONS[chatId];
          console.log(`Session cleared for ${chatId} after 24 hours.`);
      }
  }, 86400000);

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
        ...session.history.slice(-15), // تمرير آخر 15 رسالة فقط لتقليل التوكنز
        { role: "user", content: userMessage }
      ],
      temperature: 0.1 // نسبة قليلة جداً لمنع التأليف مع الحفاظ على لغة طبيعية
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // فحص أمر الإرسال للمطبخ
    if (reply.includes("[KITCHEN_GO]")) {
      const hasPhone = /(07[789]\d{7})/.test(reply);
      const hasName = reply.includes("الاسم:") && !reply.includes("[اسم الزبون]");

      if (!hasPhone || !hasName) {
        // إذا استعجل البوت بدون أخذ بيانات كاملة، يتم التعديل برمجياً
        reply = "على راسي يا غالي، بس يا ريت تبعتلي (الاسم ورقم التلفون) عشان أثبت الطلب وأبعته للمطبخ فوراً.";
        await sendWA(chatId, reply);
      } else {
        // استخراج الطلب النهائي بالتنسيق المطلوب وإرساله للمطبخ
        const finalOrder = reply.split("[KITCHEN_GO]")[1].trim();
        await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder);
        
        // إرسال رسالة تأكيد نهائية للزبون
        const confirmMessage = "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏";
        await sendWA(chatId, confirmMessage);

        session.history.push(
          { role: "user", content: userMessage },
          { role: "assistant", content: confirmMessage }
        );
        return; // إنهاء التنفيذ هنا
      }
    } else {
      // إرسال الرد العادي للزبون
      await sendWA(chatId, reply);
    }

    // حفظ المحادثة
    session.history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: reply }
    );

  } catch (err) { 
      console.error("Error processing AI response:", err.message); 
  }
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
  } catch (err) { 
    return "صورة عرض"; 
  }
}

/* ================= إرسال رسائل واتساب ================= */
async function sendWA(chatId, message) {
  try { 
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); 
  } catch (err) {
    console.error("WhatsApp Send Error:", err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Saber Bot - Complete Zones & Logic Live!"));
