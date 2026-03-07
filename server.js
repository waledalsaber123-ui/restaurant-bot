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
const SYSTEM_PROMPT = `
أنت "صابر"، مسؤول الطلبات في مطعم صابر جو سناك.
قواعدك الصارمة:
1. ممنوع اختراع أسعار أو تعويضات نهائياً.
2. الذاكرة عندك قوية جداً وتتذكر آخر 30 رسالة.
3. بمجرد ما يرسل الزبون (الاسم، الرقم، العنوان) أو يقول "تمام/اعتمد"، يجب فوراً إرسال الملخص بالتنسيق التالي:

شكرًا لك، [الاسم]. إليك ملخص الطلب النهائي:
- *الطلب*: [التفاصيل]
- *السعر*: [السعر] دينار
- *رسوم التوصيل*: [التوصيل] دينار
- *المجموع الكلي*: [الإجمالي] دينار
- *الاسم*: [الاسم]
- *الرقم*: [الرقم]
- *العنوان*: [العنوان]
سيتم توصيل الطلب خلال 30-45 دقيقة. شكرًا لاختيارك لنا!
[KITCHEN_GO]
`
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

/* ================= منطق الـ Webhook المحدث ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  const text = (body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "").trim();

  if (!chatId || chatId.includes("@g.us") || !text) return;

  if (!SESSIONS[chatId]) {
      SESSIONS[chatId] = { history: [], lastActive: Date.now(), alreadyOrdered: false };
  }
  const session = SESSIONS[chatId];
  session.lastActive = Date.now();

  // إذا تم الطلب مسبقاً، توجيه للرقم فوراً
  if (session.alreadyOrdered) {
      await sendWA(chatId, `يا غالي طلبك صار بالمطبخ وعم نجهزه. لأي استفسار كلمنا عيسى: ${SETTINGS.RESTAURANT_PHONE} 📞`);
      return;
  }

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.history.slice(-30), // الذاكرة لـ 30 رسالة
        { role: "user", content: text }
      ],
      temperature: 0.2 // تقليل الحرارة لضمان دقة الأسعار وعدم التأليف
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 15000 });

    let reply = ai.data.choices[0].message.content;

    // فحص الإرسال للمطبخ
    if (reply.includes("[KITCHEN_GO]")) {
      const orderClean = reply.replace("[KITCHEN_GO]", "\n✅ *طلب جديد مؤكد*").trim();
      
      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, orderClean);
      // إرسال للزبون
      await sendWA(chatId, orderClean);
      
      session.alreadyOrdered = true; 
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (err) {
    // في حال حصل خطأ، لا نعطي رسالة "سامحني" ونحاول مرة أخرى
    console.error("Error in AI Logic:", err);
    await sendWA(chatId, "أبشر يا غالي، بس عُلق السيستم ثانية. أرسل (الاسم والرقم) مرة ثانية عشان أعتمد الطلب فوراً! 🙏");
  }
});
    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      const orderClean = reply.replace("[KITCHEN_GO]", "\n✅ *طلب جديد مؤكد*").trim();
      
      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, `🔔 *إشعار مطبخ*\n${orderClean}`);
      
      // إرسال للزبون
      await sendWA(chatId, orderClean);
      
      session.alreadyOrdered = true; 
      return;
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: text + " " + caption }, { role: "assistant", content: reply });

  } catch (err) {
    console.error(err);
    await sendWA(chatId, "سامحني يا غالي، صار عندي ضغط رسائل. ممكن ترجع تبعت شو بدك؟ 🙏");
  }
});

async function sendWA(chatId, message) {
  try { 
      await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); 
  } catch (e) { console.error("Error sending WA:", e); }
}

app.listen(3000, () => console.log("Saber Bot - Advanced Logic Online!"));
