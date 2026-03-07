import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", 
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

/* ================= قائمة الطعام الكاملة مع التفاصيل ================= */
const MENU_ITEMS = {
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
};

// دالة لبناء الـ system prompt
const getSystemPrompt = () => {
  const menuList = Object.entries(MENU_ITEMS)
    .map(([key, item]) => `- ${item.name}: ${item.price} د.أ`)
    .join('\n');
    
  const zonesList = Object.entries(DELIVERY_ZONES)
    .map(([zone, price]) => `- ${zone}: ${price} د.أ`)
    .join('\n');

  return `أنت "صابر"، المساعد الذكي لمطعم "صابر جو سناك" في عمان.

🎯 **الهوية**:
- أردني نشمي، تستخدم اللهجة الأردنية (أبشر، يا غالي، على راسي، هلا والله)
- إذا الزبون حكى إنجليزي، رد عليه إنجليزي بنفس الروح

📍 **الموقع**: عمان - شارع الجامعة الأردنية - طلوع هافانا
⏰ **الدوام**: 2 ظهراً - 3:30 فجراً
💰 **الدفع**: كاش، زين كاش (0796893403)، CliQ

🍔 **المنيو الكامل**:
${menuList}

🚚 **مناطق التوصيل**:
${zonesList}

📋 **تعليمات مهمة**:
1. **التمييز بين الأصناف**:
   - "ديناميت" = سندويش (1 د.أ)
   - "وجبة ديناميت" = سندويش + بطاطا + بيبسي (2 د.أ)
   - "زنجر" عادي = سندويش (1.5 د.أ)
   - "وجبة زنجر" = وجبة كاملة (2 د.أ)

2. **جمع المعلومات**:
   - الاسم، رقم الهاتف، العنوان، الأصناف
   - استخرج المنطقة من العنوان لتحسب التوصيل

3. **تأكيد الطلب**:
   - اجمع كل المعلومات
   - اسأل الزبون للتأكيد: "تم؟" أو "أوكي؟"
   - بس بعد ما يقول "تم" أو "ok" أو "ايوا"، أرسل للمطبخ

4. **صيغة المطبخ** (بعد التأكيد فقط):
[KITCHEN_GO]
🔥 طلب جديد مؤكد
الاسم: [الاسم]
الرقم: [رقم الهاتف]
النوع: [توصيل/استلام]
العنوان: [العنوان]
الطلب: [الأصناف]
المجموع: [السعر] د.أ

⏱️ وقت التجهيز: 30-45 دقيقة`;
};

/* ================= المحرك الرئيسي (معدل ومصحح) ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  // تهيئة الجلسة
  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { 
      history: [], 
      pendingOrder: null,
      awaitingConfirmation: false 
    };
  }
  
  const session = SESSIONS[chatId];

  // استخراج الرسالة
  let userMessage = body.messageData?.textMessageData?.textMessage || 
                    body.messageData?.extendedTextMessageData?.text;
  
  if (!userMessage) return;

  console.log(`📩 رسالة من ${chatId}: ${userMessage}`);

  try {
    // التحقق من التأكيد
    const isConfirmation = /^(تم|ok|اوكي|confirm|yes|اكيد|ايوا|تمام|okay|yep|yeah)$/i.test(userMessage.trim());
    
    if (session.awaitingConfirmation && isConfirmation) {
      // تأكيد الطلب - نرسل للمطبخ
      const order = session.pendingOrder;
      
      if (order) {
        const kitchenMessage = `[KITCHEN_GO]
🔥 **طلب جديد مؤكد**
- **الاسم**: ${order.name || "غير محدد"}
- **الرقم**: ${order.phone || "غير محدد"}
- **النوع**: ${order.type === "pickup" ? "استلام 🚶" : "توصيل 🚚"}
- **العنوان**: ${order.type === "delivery" ? (order.address || order.zone || "غير محدد") : "الاستلام من المطعم"}
- **الطلب**:
${order.items.map(item => `  • ${item}`).join('\n')}
- **المجموع**: ${order.total} د.أ

⏱️ التجهيز: 30-45 دقيقة`;

        // إرسال للمطبخ
        await sendWA(SETTINGS.KITCHEN_GROUP, kitchenMessage);
        
        // رد للزبون
        const customerReply = `تم بحمد الله يا ${order.name || "غالي"}! ✅

طلبك:
${order.items.map(item => `• ${item}`).join('\n')}
💰 المجموع: ${order.total} د.أ
⏱️ راح يجهز خلال 30-45 دقيقة

شكراً لمطعم صابر جو سناك ❤️`;

        await sendWA(chatId, customerReply);
        
        // تنظيف الجلسة
        delete SESSIONS[chatId];
        return;
      }
    }

 // إرسال لـ OpenAI - استخدام gpt-4o-mini أسرع وأدق للمنيو الطويل
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini", // التغيير هنا
        messages: [
          { role: "system", content: getSystemPrompt() },
          ...session.history.slice(-10), // زدنا الذاكرة شوي لـ 10 رسائل
          { role: "user", content: userMessage }
        ],
        temperature: 0, // خلّيها 0 عشان يكون دقيق بالأسعار وما يمرر عروض من عنده
        max_tokens: 800
      },
      {
        headers: {
          "Authorization": `Bearer ${SETTINGS.OPENAI_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 40000 // رفعنا الوقت لـ 40 ثانية عشان ما يعطي عطل فني
      }
    );

    let reply = aiResponse.data.choices[0].message.content;
    
    // تحقق إذا في كود مطبخ في الرد
    if (reply.includes("[KITCHEN_GO]")) {
      const parts = reply.split("[KITCHEN_GO]");
      const customerMsg = parts[0].trim();
      const kitchenMsg = parts[1].trim();
      
      // استخراج معلومات الطلب من الرد
      const orderMatch = kitchenMsg.match(/الاسم:? ([^\n]+)/i);
      const phoneMatch = kitchenMsg.match(/الرقم:? ([0-9]{10})/);
      const zoneMatch = Object.keys(DELIVERY_ZONES).find(zone => kitchenMsg.includes(zone));
      
      // حفظ في الجلسة
      session.pendingOrder = {
        name: orderMatch ? orderMatch[1].trim() : "زبون",
        phone: phoneMatch ? phoneMatch[1] : "غير محدد",
        zone: zoneMatch || "غير محدد",
        items: kitchenMsg.split('\n').filter(line => line.includes('•') || line.includes('-')),
        total: kitchenMsg.match(/المجموع:? ([0-9.]+)/)?.[1] || "0",
        type: kitchenMsg.includes("استلام") ? "pickup" : "delivery"
      };
      
      session.awaitingConfirmation = true;
      
      // طلب تأكيد من الزبون
      const confirmMsg = `${customerMsg}\n\nهل البيانات صحيحة؟ أكتب "تم" للتأكيد ✅`;
      await sendWA(chatId, confirmMsg);
      
      // حفظ المحادثة
      session.history.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: confirmMsg }
      );
      
    } else {
      // رد عادي
      await sendWA(chatId, reply);
      
      // حفظ المحادثة
      session.history.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: reply }
      );
    }

  } catch (err) {
    console.error("❌ خطأ:", err.message);
    
    // رسالة خطأ ودية
    const errorMessage = "عذراً يا غالي، صار عندي عطل فني. جرب ترسل الرسالة مرة ثانية خلال دقيقتين 🙏";
    await sendWA(chatId, errorMessage);
  }
});

// دالة الإرسال مع معالجة الأخطاء
async function sendWA(chatId, message) {
  try {
    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      { chatId, message },
      { timeout: 10000 }
    );
    console.log(`✅ تم الإرسال إلى ${chatId}`);
  } catch (err) {
    console.error("❌ فشل الإرسال:", err.message);
  }
}

app.listen(3000, () => {
  console.log("🤖 صابر جو سناك شغال!");
  console.log("⏰", new Date().toLocaleString("ar-JO"));
});
