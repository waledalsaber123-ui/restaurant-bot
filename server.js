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
/* ================= المحرك الرئيسي - نسخة منع الرسائل الفارغة للمطبخ ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData.chatId;
  if (chatId.endsWith('@g.us')) return;

  const userMessage = body.messageData.textMessageData?.textMessage || body.messageData.extendedTextMessageData?.text || "";
  const now = Date.now();

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [], waitingConfirmation: false, lastActivity: now, pendingOrderData: null, orderType: "delivery" };
  }
  const session = SESSIONS[chatId];
  session.lastActivity = now;

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-20),
        { role: "user", content: userMessage }
      ],
      temperature: 0 
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // 1. منطق استخراج الفاتورة المطور [KITCHEN_GO]
    if (reply.includes("[KITCHEN_GO]")) {
        // إذا الكلمة موجودة، بنقسم النص وبناخد اللي بعدها
        const parts = reply.split("[KITCHEN_GO]");
        const orderContent = parts[1] ? parts[1].trim() : "";
        
        // حماية: إذا اللي بعد الكلمة فاضي، بناخد الرد كامل قبل الكلمة كاحتياط
        session.pendingOrderData = orderContent || parts[0].trim();
        
        // النص اللي رح يروح للزبون (بدون كود المطبخ)
        reply = parts[0].trim();

        // تحديد نوع الطلب
        if (reply.includes("استلام") || userMessage.includes("استلام") || reply.includes("موقعنا")) {
            session.orderType = "pickup";
        } else {
            session.orderType = "delivery";
        }
    }

    const phoneRegex = /(07[789]\d{7})/;
    const hasPhone = phoneRegex.test(userMessage) || session.history.some(m => phoneRegex.test(m.content));
    const confirmationWords = ["اعتمد", "نعم", "اوكي", "أكيد", "اه", "يلا", "تم", "ماشي", "توكل", "ثبت", "هات", "انجز", "توصيل", "أوك", "اوك", "استلام", "جهاز", "موافق"];
    const isConfirmed = confirmationWords.some(word => userMessage.toLowerCase().includes(word));

    // 2. الإرسال للمطبخ مع حماية ضد الرسائل الفارغة
    if (session.pendingOrderData) {
      
      const isInstantPickup = session.orderType === "pickup" && (userMessage.includes("جهاز") || userMessage.includes("دقايق") || userMessage.includes("بوصل"));

      if (session.orderType === "delivery" && !hasPhone) {
        reply = "على راسي يا غالي، بس ابعتلي (الاسم ورقم التلفون) عشان أثبت الطلب وأرميه عالمطبخ.";
      } 
      else if (isConfirmed || isInstantPickup || (hasPhone && session.waitingConfirmation)) {
        
        let kitchenHeader = session.orderType === "pickup" ? "🏪 **طلب استلام**:\n" : "✅ **طلب توصيل مؤكد**:\n";
        
        // التأكد 100% إن البيانات مش فاضية قبل الإرسال
        const finalOrderText = session.pendingOrderData || "خطأ: لم يتم استخراج تفاصيل الطلب، يرجى مراجعة المحادثة.";
        
        await sendWA(SETTINGS.KITCHEN_GROUP, kitchenHeader + finalOrderText);
        
        await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");
        
        session.waitingConfirmation = false;
        session.pendingOrderData = null;
        return; 
      } 
      else {
        session.waitingConfirmation = true;
        if (!reply.includes("أعتمد")) {
            reply += "\n\nأعتمد الطلب يا نشمي؟";
        }
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
