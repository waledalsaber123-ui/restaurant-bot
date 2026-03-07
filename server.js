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

/* ================= نظام التعليمات (المنيو والمناطق الأصلية) ================= */
const getSystemPrompt = () => {
  return `
أنت "صابر"، المسؤول عن الحجوزات في مطعم (صابر جو سناك). 

⚠️ **قواعد الفاتورة والتأكيد (قواعد مالية لا تقبل الاجتهاد)**:
1. بمجرد تحديد الطلب والمنطقة، يجب إرسال "فاتورة تفصيلية" للزبون بهذا الشكل:
   - *الطلب*: [اسم الصنف]
   - *السعر*: [سعر الصنف]
   - *رسوم التوصيل*: [حسب المنطقة]
   - *المجموع الكلي*: [المجموع]
   - *الاسم*: [اتركه فارغاً ليملأه الزبون]
   - *الرقم*: [اتركه فارغاً ليملأه الزبون]
   - *العنوان*: [المنطقة]
   ثم اسأله: "أكدلي الاسم ورقم التلفون عشان نعتمد الطلب؟"

2. **قاعدة [KITCHEN_GO] الصارمة**: ممنوع نهائياً إرسال هذا الكود إلا إذا توفرت: (الأصناف، نوع الطلب، الموعد، الاسم، ورقم هاتف يبدأ بـ 07).

🍔 **المنيو الرسمي**:
**الوجبات العائلية:**
- الوجبة الاقتصادية سناكات (7 دنانير): 4 سندويشات (2 سكالوب، 1 برجر 150غم، 1 زنجر) + 2 بطاطا + 1 لتر مشروب.
- الوجبة العائلية سناكات (10 دنانير): 6 سندويشات (2 سكالوب، 2 زنجر، 2 برجر 150غم) + 4 بطاطا + 2 لتر مشروب.
- الوجبة العملاقة سناكات (14 دينار): 9 سندويشات (3 سكالوب، 3 زنجر، 3 برجر 150غم) + 6 بطاطا + 3 لتر مشروب.
- وجبة الشاورما صدر الاقتصادية (6 دنانير): 6 سندويشات (48 قطعة) + بطاطا عائلي.
- وجبة الشاورما صدر العائلي (9 دنانير): 8 سندويشات (72 قطعة) + بطاطا عائلي كبير.

**الوجبات الفردية (ساندويش + بطاطا):**
- وجبة سكالوب (2 دينار)، وجبة زنجر (2 دينار)، وجبة برجر 150غم (2 دينار).
- وجبة شاورما: عادي (2 دينار)، سوبر (2.75 دينار)، دبل (3.25 دينار)، تربل (4 دينار).

**الساندويشات فرط:**
- سكالوب (1.5)، زنجر (1.5)، برجر 150غم (1.5)، شاورما عادي (1)، شاورما سوبر (1.5).
- ملاحظة: لتحويل أي ساندويش لوجبة ضيف (1 دينار).

**العروض (نركز عليها):**
- ساندويش ديناميت 45سم (1 دينار).
- صاروخ الشاورما 45سم (1.5 دينار).
- قمبلة رمضان (برجر 250 جرام) (2.25 دينار).
- خابور كباب (وزن 200-250غم) (2 دينار).

**الإضافات:** بطاطا (1)، عائلي (3)، جامبو (6)، جبنة (0.5)، غازي صغير (0.35)، لتر (0.5).

🚚 **قائمة مناطق التوصيل**:
- [1.5د]: صويلح، إشارة الدوريات، مجدي مول.
- [2د]: الجبيهة، الجامعة الأردنية، ضاحية الرشيد، تلاع العلي، حي الجامعة، خلدا، دوار الواحة، مشفى الحرمين، نفق الصحافة، جبل الحسين، المستشفى التخصصي.
- [2.5د]: الديار، السهل، الروابي، أم أذينة، شارع المدينة الطبية، دابوق، الجاردنز، الشميساني، العبدلي، اللويبدة، الرابية، مجمع الأعمال.
- [3د]: الفحيص، الدوار (1-8)، جبل عمان، عبدون، الصويفية، الرونق، عين الباشا، التطبيقية، وسط البلد، حي نزال، جبل النزهة، طريق المطار، مستشفى البشير، البقعة.
- [3.5د]: البيادر، شارع الحرية، الهاشمي الشمالي، الهاشمي الجنوبي، طبربور، ضاحية الياسمين.
- [4د]: وادي السير، ماركا الشمالية، ماركا الجنوبية، خريبة السوق، اليادودة، البنيات، القويسمة، أبو علندا، جبل المنارة، مرج الحمام، سحاب، طريق المطار (بعد جسر مادبا).

⚠️ **عند التأكيد النهائي**: أرسل [KITCHEN_GO] متبوعاً بتفاصيل الطلب كاملة (الاسم، الرقم، العنوان، الطلب، المجموع، الوقت).
`;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  let userMessage = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
  if (!userMessage) return;

  try {
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...session.history.slice(-30), // ذاكرة لـ 30 رسالة
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = aiResponse.data.choices[0].message.content;

    // --- منطق الحماية والتحقق البرمجي ---
    if (reply.includes("[KITCHEN_GO]")) {
      const hasPhone = /(07[789]\d{7})/.test(reply) || /07\d{8}/.test(userMessage);
      const hasName = reply.includes("الاسم") && !reply.includes("[اسم الزبون]");

      if (!hasPhone || !hasName) {
        reply = "على راسي يا غالي، بس أعطيني الاسم ورقم التلفون عشان أعتمد الطلب وأبعته للمطبخ فوراً.";
      } else {
        const orderDetails = reply.split("[KITCHEN_GO]")[1].trim();
        
        // إرسال للمطبخ
        await sendWA(SETTINGS.KITCHEN_GROUP, `✅ *طلب جديد مؤكد*:\n${orderDetails}`);
        
        // تأكيد للزبون
        await sendWA(chatId, "أبشر، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏");

        session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });
        // مسح الجلسة بعد 24 ساعة لضمان تذكر "بكره"
        setTimeout(() => { if (SESSIONS[chatId]) delete SESSIONS[chatId]; }, 86400000);
        return; 
      }
    }

    await sendWA(chatId, reply);
    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) {
    console.error("Error:", err.message);
  }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) {}
}

app.listen(3000, () => console.log("Saber Bot - Original Menu & Zones Loaded!"));
