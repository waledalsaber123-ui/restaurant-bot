import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import path from "path";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

// مخزن الجلسات (يمكن تطويره لـ Database لاحقاً لضمان عدم الضياع نهائياً)
const SESSIONS = {};

const DATA = {
  INFO: `📍 الموقع: عمان - شارع الجامعة الأردنية - طلوع هافانا. 🗺️ https://maps.google.com/?q=32.0155,35.8675`,
  MENU: `الوجبات العائلية 
الوجبة الاقتصادية  سناكات 7 دنانير تحتوي على 4 سندويشات 2 سكالوب و 1 برجر 150 غم 1 زنجر و 2 بطاطا و 1 لتر مشروب غازي 
الوجبة العائلية سناكات 10 دنانير 6 تحتوي على 6 سندويشات 2 سكالوب 2 زنجر 2 برجر 150 غم 4 بطاطا 2 لتر مشروب غازي 
الوجبة العملاقة سناكات 14 دينار تحتوي على 9 سندويشات 3 سكالوب 3 زنجر 3 برجر 150 جرام 6 بطاطا 3 لتر مشروب غازي 
وجبة الشاورما الاقتصادية 6 دنانير تحتوي  6 سندويشات شورما ما يعادل 48 قطعه بطاطا عائلي  تائتي  صدر  
وجبة الشاورما العائلي ( الاوفر) 9 دنانير 8 سندويشات 72 قطعه  و بطاطا عائلي كبير  تائتي ب صدر
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
ملاحطة لتحويل العروض و السندويشات الى وجبات ضيف دينار .`,
  DELIVERY: `[توصيل ثابت]الفحيص	3
شارع مكة	2.75
الدوار الأول	3
الدوار الثاني	3
الدوار الثالث	3
الدوار الرابع	3
الدوار الخامس	3
الدوار السادس	3
الدوار السابع	3
الدوار الثامن	3
جبل عمان	3
عبدون	3
دير غبار	3
الديار	2.5
الصويفية	3
السهل	2.5
الرونق	3
البيادر	3.5
عراق الامير	5
وادي السير	4
الروابي	2.5
ام اذينة	2.5
الصالحين	2.5
المستشفى الإسلامي	2.5
خلدا	2.5
عين الباشا	3
ام السماق	2.5
المدينة الطبية	2.5
شارع المدينة الطبية	2.5
الرباحية	4
الجندويل	3
الكرسي	3
اشارة الدوريات	1.5
دابوق	2.5
صويلح	1.5
شارع الجامعة الاردنية	2
الجامعة الاردنية	2
ضاحية الرشيد	2
حي الجامعة	2
الجبيهة	2
ابن عوف	2
ابو نصير	2.5
شفا بدران	3
شارع الاردن (يحسب حسب المسافة فقط)	
حي الزيتونة	2.5
حي الديوان	2
الكمالية	2
جامعة العلوم التطبيقية	3
دوار المشاغل	2.75
الكوم	3
مرج الفرس	4
حي المنصور	2.5
المدينة الرياضية	2
ضاحية الروضة	2
تلاع العلي	2
حي البركة	2.25
تلاع العلي الشمالي	2
الرابية	2.25
الجاردنز	2.5
شارع عبدالله غوشة	2.75
مجمع جبر	2.75
شارع وصفي التل	2.5
حي الخالدلين	2
الشميساني	2.5
وادي صقرة	2.5
اللويبدة	2.5
العبدلي	2.5
جبل الحسين	2
مستشفى الاردن	3
المستشفى التخصصي	2
جبل القلعة	2.5
وادي الحدادة	2.5
طريق المطار	3.5
المستندة	4
جبل الزهور	3
ماركا الجنوبية	4
خريبة السوق	4
اليادوده	4
البنيات	4
ضاحية الحاج حسن	4
جبل التاج	4
جبل الجوفة	4
وسط البلد	3.5
حي نزال	3
شارع الحرية	3.5
الوحدات	4
المقابلين	3.5
وادي الرمم	4
عرجان	2.5
العلكومية	4
الجويده	4
ماركا الشمالية	4
ابو علندا	4
القويسمة	4
ام نوارة	4
الهاشمي الشمالي	3.5
الهاشمي الجنوبي	3.5
جبل النزهه	3
جبل القصور	3
ضاحية الاقصى	3
شارع الاذاعة	3
جبل المناره	4
مخيم الحسين	2.75
ضاحية الروضة	2.5
جبل النظيف	3
حي عدن	4
مجمع المحطة	3
الجبل الاخضر	3
شارع الاستقلال	3
مستشفى البشير	3.5
ضاحية الامير حسن	2.5
راس العين	3
المهاجرين	3
كلية حطين	4
دوار الجمرك	4
دوار الشرق الاوسط	4
ضاحية الياسمين	3.5
ربوة عبدون	3.5
الاشرفية	4
ام الحيران	4
دوار الحمايدة	4
جاوا	4
جبل النصر	4
صالحية العابد	4
الرجيب	4
طارق المطار	4
مرج الحمام	3.6
طبربور	3.5
حي الصحابة	3
جبل الحديد	4
ضاحية النخيل	3
الذراع الغربي	2.5
استقلال مول	2.5
محكمة جنوب عمان	4
اسكان الصيادلة	2.5
ضاحية الفاروق	2.5
السوق المركزي	4
كلية لومينوس	3
ضاحية الامير علي	4
جامعة البترا	4
مستشفى الامل	2
مستشفى الملكة علياء	3
وزارة الثقافة	2.5
جبل المريخ	3.5
حي الصديق	3.5
مستشفى الحياة	3.5
الحرشة	4
شارع الامير محمد	3
حي الرحمانية	3
عريفة مول	3
ام قصير	4
شارع الحزام	4
دوار الداخلية	2
نادي السباق	4
مستشفى ماركا التخصصي	4
مستشفى ماركا العسكري	4
حي الارمن	4
حي الطفايلة	4
الظهير	4
حي الرونق	3
مجدي مول	1.5
مستشفى العيون التخصصي	2
مستشفى الامير حمزة	3
مركز السكري	3
المصدار	3
السفارة الصينية	2.5
مكة مول	2
دائرة الافتاء	2.5
مدارس الحصاد التربوي	4
المرقب	4
المختار مول	1.75
قرية النخيل	3
مجمع الاعمال	2.5
شارع عرار	3
ابو السوس	4
مدارس الاتحاد	2.5
السفارة الامريكية	3
ضاحية الامير راشد	2.5
مستشفى عبدالهادي	2.5
مستشفى فرح	2.5
جامعة العلوم الاسلامية	2.5
مستشفى الرويال	2.5
طلوع نيفين	1.75
دوار الواحة	2
دوار الكيلو	2.25
دوار المدينة الطبية	2.5
دوار الشعب	2.5
دوار خلدا	2.25
مشفى الحرمين	2
كلية المجتمع العربي	1.5
ضاحية الاستقلال	2
شارع المدينة المنورة	2
ستي مول	2
عمان مول	3
ياسر مول	3
نفق الصحافة	2
جامعة عمان المفتوحة	4
مستشفى الخالدي	3
صافوط	2
البقعة	3.`
};

const SYSTEM_PROMPT = `
أنت "صابر". ذاكرتك حديدية وتتذكر كل تفاصيل الطلب السابقة.
- ممنوع نسيان الأصناف التي اختارها العميل.
- إذا أرسل العميل صورة، ادمج محتواها مع الطلب الحالي ولا تبدأ من الصفر.
- الترتيب: 1. حصر الأصناف وسعرها. 2. تحديد (توصيل/استلام) وحساب السعر النهائي (طبربور دائماً 3د). 3. طلب البيانات.
- لا تنهي المحادثة بـ "كيف يمكنني مساعدتك" إذا كان هناك طلب قيد التنفيذ.
- كلمة [KITCHEN_GO] تُرسل فقط عند اكتمال كل شيء.
`;

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  let chatId = body.senderData?.chatId;
  if (!chatId) return;

  // استعادة أو إنشاء الجلسة بذاكرة عميقة
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = { role: "user", content: [] };

  // معالجة الرسالة القادمة (نص، صوت، أو صورة)
  if (body.typeWebhook === "incomingMessageReceived") {
    userMessage.content.push({ type: "text", text: body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "" });
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userMessage.content.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userMessage.content.push({ type: "text", text: "حلل هذه الصورة وأضفها لطلبي الحالي." });
  } else if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("audio")) {
    const text = await transcribeVoice(body.messageData.fileMessageData.downloadUrl);
    userMessage.content.push({ type: "text", text: text });
  }

  if (userMessage.content.length === 0) return;

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + DATA.INFO + "\n" + DATA.MENU + "\n" + DATA.DELIVERY },
        ...session.history.slice(-50), // يتذكر آخر 50 رسالة لضمان عدم النسيان
        userMessage
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب معتمد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ. نورتنا! 🙏");
      delete SESSIONS[chatId]; // تصفير الذاكرة فقط بعد النجاح
      return;
    }

    await sendWA(chatId, reply);
    // حفظ في الذاكرة بصيغة مبسطة
    session.history.push(userMessage);
    session.history.push({ role: "assistant", content: reply });
  } catch (err) { console.error("Error"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

async function transcribeVoice(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const filePath = path.join("/tmp", `v_${Date.now()}.ogg`);
    fs.writeFileSync(filePath, Buffer.from(response.data));
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "whisper-1");
    const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }
    });
    fs.unlinkSync(filePath);
    return res.data.text;
  } catch (err) { return ""; }
}

app.listen(3000, () => console.log("Saber Bot - Anti-Forget Version Live"));
