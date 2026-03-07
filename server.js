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
  // عروض التوفير (الأكثر طلباً)
  "ديناميت": { name: "ساندويش ديناميت (45 سم)", price: 1.0, category: "offers", isMeal: false },
  "ديناميت زنجر": { name: "ساندويش ديناميت زنجر (45 سم)", price: 1.0, category: "offers", isMeal: false },
  "صاروخ شاورما": { name: "صاروخ شاورما (45 سم)", price: 1.5, category: "offers", isMeal: false },
  "قنبلة رمضان": { name: "قنبلة رمضان (برجر 250 جرام)", price: 2.25, category: "offers", isMeal: false },
  "خابور كباب": { name: "خابور كباب (45 سم - 250غم كباب)", price: 2.0, category: "offers", isMeal: false },
  
  // الوجبات الفردية والسندويشات
  "سكالوب": { name: "وجبة سكالوب", price: 2.0, category: "individual", isMeal: true },
  "سندويش سكالوب": { name: "سندويش سكالوب", price: 1.5, category: "individual", isMeal: false },
  "زنجر": { name: "وجبة زنجر", price: 2.0, category: "individual", isMeal: true },
  "سندويش زنجر": { name: "سندويش زنجر", price: 1.5, category: "individual", isMeal: false },
  "برجر": { name: "وجبة برجر 150غم", price: 2.0, category: "individual", isMeal: true },
  "سندويش برجر": { name: "سندويش برجر 150غم", price: 1.5, category: "individual", isMeal: false },
  
  // وجبات الشاورما
  "شاورما عادي": { name: "ساندويش شاورما عادي", price: 1.0, category: "shawarma", isMeal: false },
  "شاورما سوبر": { name: "ساندويش شاورما سوبر", price: 1.5, category: "shawarma", isMeal: false },
  "وجبة شاورما عادي": { name: "وجبة شاورما عادي", price: 2.0, category: "shawarma", isMeal: true },
  "وجبة شاورما سوبر": { name: "وجبة شاورما سوبر", price: 2.75, category: "shawarma", isMeal: true },
  "وجبة شاورما دبل": { name: "وجبة شاورما دبل", price: 3.25, category: "shawarma", isMeal: true },
  "وجبة شاورما تربل": { name: "وجبة شاورما تربل", price: 4.0, category: "shawarma", isMeal: true },
  
  // الوجبات العائلية
  "الاقتصادية": { name: "الاقتصادية (4 ساندويشات مشكلة + 2 بطاطا + 1 لتر بيبسي)", price: 7.0, category: "family", isMeal: true },
  "العائلية": { name: "العائلية (6 ساندويشات مشكلة + 4 بطاطا + 2 لتر بيبسي)", price: 10.0, category: "family", isMeal: true },
  "العملاقة": { name: "العملاقة (9 ساندويشات مشكلة + 6 بطاطا + 3 لتر بيبسي)", price: 14.0, category: "family", isMeal: true },
  "شاورما اقتصادية": { name: "وجبة شاورما اقتصادية (6 ساندويشات)", price: 6.0, category: "family", isMeal: true },
  "شاورما أوفر": { name: "وجبة شاورما أوفر (8 ساندويشات)", price: 9.0, category: "family", isMeal: true }
};

/* ================= مناطق التوصيل الكاملة ================= */
const DELIVERY_ZONES = {
  "صويلح": 1.5,
  "إشارة الدوريات": 1.5,
  "مجدي مول": 1.5,
  "المختار مول": 1.5,
  "طلوع نيفين": 1.75,
  "شارع الجامعة": 2.0,
  "الجامعة الأردنية": 2.0,
  "ضاحية الرشيد": 2.0,
  "حي الجامعة": 2.0,
  "الجبيهة": 2.0,
  "ابن عوف": 2.0,
  "الكمالية": 2.0,
  "حي الديوان": 2.0,
  "المدينة الرياضية": 2.0,
  "ضاحية الروضة": 2.0,
  "تلاع العلي": 2.0,
  "حي الخالديين": 2.0,
  "جبل الحسين": 2.0,
  "المستشفى التخصصي": 2.0,
  "دوار الداخلية": 2.0,
  "استقلال مول": 2.0,
  "مكة مول": 2.0,
  "مستشفى الامل": 2.0,
  "ضاحية الاستقلال": 2.0,
  "شارع المدينة المنورة": 2.0,
  "ستي مول": 2.0,
  "نفق الصحافة": 2.0,
  "دوار الواحة": 2.0,
  "مشفى الحرمين": 2.0,
  "كلية المجتمع العربي": 2.0,
  "حي البركة": 2.25,
  "الرابية": 2.25,
  "دوار الكيلو": 2.25,
  "دوار خلدا": 2.25,
  "الديار": 2.5,
  "السهل": 2.5,
  "الروابي": 2.5,
  "ام اذينة": 2.5,
  "الصالحين": 2.5,
  "المستشفى الإسلامي": 2.5,
  "خلدا": 2.5,
  "ام السماق": 2.5,
  "المدينة الطبية": 2.5,
  "دابوق": 2.5,
  "حي المنصور": 2.5,
  "الجاردنز": 2.5,
  "شارع وصفي التل": 2.5,
  "الشميساني": 2.5,
  "وادي صقرة": 2.5,
  "اللويبدة": 2.5,
  "العبدلي": 2.5,
  "جبل القلعة": 2.5,
  "وادي الحدادة": 2.5,
  "عرجان": 2.5,
  "ضاحية الامير حسن": 2.5,
  "اسكان الصيادلة": 2.5,
  "ضاحية الفاروق": 2.5,
  "مجمع الاعمال": 2.5,
  "مدارس الاتحاد": 2.5,
  "ضاحية الامير راشد": 2.5,
  "مستشفى عبدالهادي": 2.5,
  "مستشفى فرح": 2.5,
  "جامعة العلوم الاسلامية": 2.5,
  "مستشفى الرويال": 2.5,
  "دوار المدينة الطبية": 2.5,
  "دوار الشعب": 2.5,
  "السفارة الصينية": 2.5,
  "دائرة الافتاء": 2.5,
  "وزارة الثقافة": 2.5,
  "شارع مكة": 2.75,
  "دوار المشاغل": 2.75,
  "شارع عبدالله غوشة": 2.75,
  "مجمع جبر": 2.75,
  "مخيم الحسين": 2.75,
  "الفحيص": 3.0,
  "الدوار الأول": 3.0,
  "الدوار الثاني": 3.0,
  "الدوار الثالث": 3.0,
  "الدوار الرابع": 3.0,
  "الدوار الخامس": 3.0,
  "الدوار السادس": 3.0,
  "الدوار السابع": 3.0,
  "الدوار الثامن": 3.0,
  "جبل عمان": 3.0,
  "عبدون": 3.0,
  "الرونق": 3.0,
  "الجندويل": 3.0,
  "الكرسي": 3.0,
  "ابو نصير": 3.0,
  "شفا بدران": 3.0,
  "الكوم": 3.0,
  "طريق المطار": 3.0,
  "حي نزال": 3.0,
  "جبل النزهه": 3.0,
  "جبل القصور": 3.0,
  "ضاحية الاقصى": 3.0,
  "شارع الاذاعة": 3.0,
  "جبل النظيف": 3.0,
  "مجمع المحطة": 3.0,
  "الجبل الاخضر": 3.0,
  "شارع الاستقلال": 3.0,
  "رأس العين": 3.0,
  "المهاجرين": 3.0,
  "ضاحية الياسمين": 3.0,
  "ربوة عبدون": 3.0,
  "حي الصحابة": 3.0,
  "ضاحية النخيل": 3.0,
  "الذراع الغربي": 3.0,
  "كلية لومينوس": 3.0,
  "حي الرحمانية": 3.0,
  "عريفة مول": 3.0,
  "السفارة الامريكية": 3.0,
  "مستشفى الملكة علياء": 3.0,
  "حي الصديق": 3.0,
  "حي الرونق": 3.0,
  "مستشفى الامير حمزة": 3.0,
  "مركز السكري": 3.0,
  "المصدار": 3.0,
  "قرية النخيل": 3.0,
  "شارع عرار": 3.0,
  "صافوط": 3.0,
  "البقعة": 3.0,
  "جبل الزهور": 3.25,
  "البيادر": 3.5,
  "وسط البلد": 3.5,
  "شارع الحرية": 3.5,
  "المقابلين": 3.5,
  "الهاشمي الشمالي": 3.5,
  "الهاشمي الجنوبي": 3.5,
  "مستشفى البشير": 3.5,
  "طبربور": 3.5,
  "مستشفى الحياة": 3.5,
  "جبل المريخ": 3.5,
  "مرج الحمام": 3.6,
  "وادي السير": 4.0,
  "الرباحية": 4.0,
  "المستندة": 4.0,
  "ماركا الجنوبية": 4.0,
  "خريبة السوق": 4.0,
  "اليادودة": 4.0,
  "البنيات": 4.0,
  "ضاحية الحاج حسن": 4.0,
  "جبل التاج": 4.0,
  "جبل الجوفة": 4.0,
  "الوحدات": 4.0,
  "وادي الرمم": 4.0,
  "العلكومية": 4.0,
  "الجويدة": 4.0,
  "ماركا الشمالية": 4.0,
  "ابو علندا": 4.0,
  "القويسمة": 4.0,
  "ام نوارة": 4.0,
  "جبل المنارة": 4.0,
  "حي عدن": 4.0,
  "كلية حطين": 4.0,
  "دوار الجمرك": 4.0,
  "دوار الشرق الاوسط": 4.0,
  "الاشرفية": 4.0,
  "ام الحيران": 4.0,
  "دوار الحمايدة": 4.0,
  "جاوا": 4.0,
  "جبل النصر": 4.0,
  "صالحية العابد": 4.0,
  "الرجيب": 4.0,
  "طارق المطار": 4.0,
  "جبل الحديد": 4.0,
  "محكمة جنوب عمان": 4.0,
  "السوق المركزي": 4.0,
  "ضاحية الامير علي": 4.0,
  "جامعة البترا": 4.0,
  "الحرشة": 4.0,
  "ام قصير": 4.0,
  "شارع الحزام": 4.0,
  "نادي السباق": 4.0,
  "مستشفى ماركا التخصصي": 4.0,
  "مستشفى ماركا العسكري": 4.0,
  "حي الارمن": 4.0,
  "حي الطفايلة": 4.0,
  "الظهير": 4.0,
  "المرقب": 4.0,
  "مدارس الحصاد التربوي": 4.0,
  "ابو السوس": 4.0,
  "جامعة عمان المفتوحة": 4.0,
  "عراق الامير": 5.0
};

// دالة استخراج رقم الهاتف
function extractPhone(text) {
  const phoneMatch = text.match(/0[7-9][0-9]{8}/);
  return phoneMatch ? phoneMatch[0] : null;
}

// دالة استخراج المنطقة من النص
function extractZone(text) {
  for (const zone of Object.keys(DELIVERY_ZONES)) {
    if (text.includes(zone)) {
      return { zone, price: DELIVERY_ZONES[zone] };
    }
  }
  return null;
}

// دالة حساب المجموع
function calculateOrderTotal(items, zonePrice = 0, type = "delivery") {
  let subtotal = 0;
  const itemsList = [];
  
  for (const item of items) {
    const menuItem = MENU_ITEMS[item.name];
    if (menuItem) {
      const itemTotal = menuItem.price * (item.quantity || 1);
      subtotal += itemTotal;
      itemsList.push(`${item.quantity || 1} × ${menuItem.name} = ${itemTotal} د.أ`);
    }
  }
  
  const deliveryFee = type === "delivery" ? zonePrice : 0;
  const total = subtotal + deliveryFee;
  
  return {
    items: itemsList,
    subtotal: subtotal.toFixed(2),
    delivery: deliveryFee.toFixed(2),
    total: total.toFixed(2)
  };
}

// دالة بناء system prompt
function getSystemPrompt() {
  // تحويل المنيو لنص
  const menuText = Object.entries(MENU_ITEMS)
    .map(([key, item]) => `- ${item.name}: ${item.price} د.أ`)
    .join('\n');
  
  // تحويل مناطق التوصيل لنص
  const zonesByPrice = {};
  Object.entries(DELIVERY_ZONES).forEach(([zone, price]) => {
    if (!zonesByPrice[price]) zonesByPrice[price] = [];
    zonesByPrice[price].push(zone);
  });
  
  const zonesText = Object.entries(zonesByPrice)
    .sort((a, b) => a[0] - b[0])
    .map(([price, zones]) => `- **${price} د.أ**: ${zones.join('، ')}`)
    .join('\n');

  return `أنت "صابر"، المساعد الذكي لمطعم "صابر جو سناك" في عمان.

🎯 **الهوية**:
- أردني نشمي، تستخدم اللهجة الأردنية (أبشر، يا غالي، على راسي، هلا والله، نورت)
- إذا الزبون حكى إنجليزي، رد عليه إنجليزي بنفس الروح

📍 **الموقع**: عمان - شارع الجامعة الأردنية - طلوع هافانا
⏰ **الدوام**: 2 ظهراً - 3:30 فجراً
💰 **الدفع**: كاش، زين كاش (0796893403)، CliQ

🍔 **المنيو الكامل**:
${menuText}

🚚 **مناطق التوصيل**:
${zonesText}

📋 **تعليمات صارمة للطلبات**:

1. **التمييز بين الأصناف بدقة**:
   - "ديناميت" أو "ديناميت زنجر" = سندويش (1 د.أ) فقط
   - "زنجر" بدون وجبة = سندويش زنجر (1.5 د.أ)
   - "وجبة زنجر" = سندويش + بطاطا + بيبسي (2 د.أ)
   - إذا قال "ديناميت" ما تحوله لوجبة إلا إذا طلب صراحة "وجبة ديناميت"

2. **جمع المعلومات الإجبارية قبل التأكيد**:
   - الاسم الكامل
   - رقم هاتف صحيح (يبدأ بـ 07...)
   - العنوان الكامل (للتوصيل) أو تأكيد "استلام"
   - المنطقة (لاستخراج سعر التوصيل)
   - الأصناف المطلوبة بالتفصيل

3. **حساب التوصيل**:
   - إذا قال "توصيل"، اسأل عن المنطقة وابحث عنها في القائمة
   - استخرج سعر التوصيل من القائمة وأضفه للمجموع
   - إذا قال "استلام" أو "بالمحل"، التوصيل = 0 دينار

4. **نظام الحجز (استلام أو توصيل)**:
   - للاستلام: الاسم + الرقم + الوقت + الطلب
   - للتوصيل: الاسم + الرقم + العنوان + المنطقة + الوقت + الطلب
   - أرسل [RESERVATION_GO] مع التفاصيل كاملة

5. **صيغة تأكيد الطلب (بعد جمع كل المعلومات)**:
   - اعرض ملخص الطلب كامل مع الأصناف والمجموع
   - اسأل: "هل البيانات صحيحة؟ أكتب تم للتأكيد"
   - فقط بعد كتابة "تم" أو "ok" ترسل للمطبخ

6. **صيغة إرسال للمطبخ** (بعد التأكيد فقط):
[KITCHEN_GO]
🔔 **طلب جديد مؤكد**
- **الاسم**: [الاسم الكامل]
- **الرقم**: [رقم الهاتف]
- **نوع الطلب**: [توصيل / استلام]
- **العنوان**: [العنوان كامل مع المنطقة]
- **الطلب**: 
[قائمة الأصناف بالتفصيل]
- **حساب الأكل**: [السعر] د.أ
- **التوصيل**: [السعر] د.أ
- **المجموع الكلي**: [المجموع] د.أ

⏱️ التجهيز: 30-45 دقيقة

⚠️ **تنبيه مهم**: لا ترسل للمطبخ قبل التأكد من جميع البيانات وأخذ موافقة الزبون الصريحة`;
}

/* ================= المحرك الرئيسي ================= */
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
      awaitingConfirmation: false,
      userData: {
        name: null,
        phone: null,
        address: null,
        zone: null,
        zonePrice: 0
      }
    };
  }
  
  const session = SESSIONS[chatId];

  // استخراج الرسالة
  let userMessage = body.messageData?.textMessageData?.textMessage || 
                    body.messageData?.extendedTextMessageData?.text;
  
  if (!userMessage) return;

  console.log(`📩 رسالة من ${chatId}: ${userMessage}`);

  try {
    // استخراج البيانات من الرسالة
    const phone = extractPhone(userMessage);
    if (phone) session.userData.phone = phone;
    
    const zoneInfo = extractZone(userMessage);
    if (zoneInfo) {
      session.userData.zone = zoneInfo.zone;
      session.userData.zonePrice = zoneInfo.price;
    }

    // التحقق من نوع الطلب (استلام أو توصيل)
    if (userMessage.includes("استلام") || userMessage.includes("بالمحل") || userMessage.includes("احضر")) {
      session.userData.orderType = "pickup";
      session.userData.zonePrice = 0;
      session.userData.address = "استلام من المطعم";
    } else if (userMessage.includes("توصيل") || userMessage.includes("دليفري")) {
      session.userData.orderType = "delivery";
    }

    // التحقق من التأكيد
    const isConfirmation = /^(تم|ok|اوكي|confirm|yes|اكيد|ايوا|تمام|okay|yep|yeah)$/i.test(userMessage.trim());
    
    if (session.awaitingConfirmation && isConfirmation && session.pendingOrder) {
      // تأكيد الطلب - نرسل للمطبخ
      const order = session.pendingOrder;
      const userData = session.userData;
      
      // بناء رسالة المطبخ
      const kitchenMessage = `[KITCHEN_GO]
🔔 **طلب جديد مؤكد**
- **الاسم**: ${userData.name || "غير محدد"}
- **الرقم**: ${userData.phone || "غير محدد"}
- **نوع الطلب**: ${userData.orderType === "pickup" ? "استلام من المطعم 🚶" : "توصيل 🚚"}
- **العنوان**: ${userData.orderType === "delivery" ? (userData.address || userData.zone || "غير محدد") : "الاستلام من المطعم"}
- **الطلب**: 
${order.items.join('\n')}
- **حساب الأكل**: ${order.subtotal} د.أ
- **التوصيل**: ${order.delivery} د.أ
- **المجموع الكلي**: ${order.total} د.أ

⏱️ التجهيز: 30-45 دقيقة`;

      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, kitchenMessage);
      
      // رد للزبون
      const customerReply = `تم بحمد الله يا ${userData.name || "غالي"}! ✅

طلبك:
${order.items.join('\n')}
💰 المجموع الكلي: ${order.total} د.أ
⏱️ راح يجهز خلال 30-45 دقيقة

شكراً لثقتك بمطعم صابر جو سناك ❤️`;

      await sendWA(chatId, customerReply);
      
      // تنظيف الجلسة
      delete SESSIONS[chatId];
      return;
    }

    // إرسال لـ OpenAI
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: getSystemPrompt() },
          ...session.history.slice(-8),
          { 
            role: "system", 
            content: `معلومات الزبون الحالية: ${JSON.stringify(session.userData)}` 
          },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 800
      },
      {
        headers: {
          "Authorization": `Bearer ${SETTINGS.OPENAI_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    let reply = aiResponse.data.choices[0].message.content;
    
    // تحقق إذا في كود مطبخ في الرد
    if (reply.includes("[KITCHEN_GO]")) {
      const parts = reply.split("[KITCHEN_GO]");
      const customerMsg = parts[0].trim();
      const kitchenMsg = parts[1].trim();
      
      // استخراج معلومات الطلب من الرد
      const nameMatch = kitchenMsg.match(/الاسم:? ([^\n]+)/i);
      const phoneMatch = kitchenMsg.match(/الرقم:? ([0-9]{10})/);
      const zoneMatch = extractZone(kitchenMsg);
      
      // تحديث بيانات الجلسة
      if (nameMatch) session.userData.name = nameMatch[1].trim();
      if (phoneMatch) session.userData.phone = phoneMatch[1];
      if (zoneMatch) {
        session.userData.zone = zoneMatch.zone;
        session.userData.zonePrice = zoneMatch.price;
      }
      
      // استخراج الأصناف وحساب المجموع
      const items = [];
      const itemLines = kitchenMsg.split('\n').filter(line => line.includes('•') || line.includes('-'));
      
      // محاولة حساب المجموع
      const orderTotal = calculateOrderTotal(
        items.map(i => ({ name: i })), 
        session.userData.zonePrice,
        session.userData.orderType || "delivery"
      );
      
      session.pendingOrder = orderTotal;
      session.awaitingConfirmation = true;
      
      // طلب تأكيد من الزبون
      const confirmMsg = `${customerMsg}\n\n📋 **ملخص الطلب**:\n${orderTotal.items.join('\n')}\n💰 المجموع: ${orderTotal.total} د.أ\n\nهل البيانات صحيحة؟ أكتب "تم" للتأكيد ✅`;
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

// دالة الإرسال
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
