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

// دالة استخراج الأرقام
const extractPhone = (text) => {
  const match = text.match(/(07[789]\d{7})/);
  return match ? match[0] : null;
};

/* ================= المنيو والمناطق في الـ System Prompt ================= */
const getSystemPrompt = (session) => {
  return `أنت "صابر"، المساعد الذكي لمطعم "صابر جو سناك" في عمان.
  هويتك: أردني نشمي، لهجتك (أبشر، يا غالي، على راسي).

  ⏰ الدوام: 2 ظهراً - 3:30 فجراً | الموقع: شارع الجامعة - طلوع هافانا.

  📋 **المنيو الرسمي (ممنوع الغلط بالأسعار)**:
  1. عروض الـ 1 د.أ: ساندويش ديناميت زنجر (45 سم) فقط.
  2. عروض الـ 1.5 د.أ: صاروخ شاورما (45 سم) فقط.
  3. الزنجر العادي: ساندويش (1.5 د.أ) | وجبة كاملة مع بطاطا وبيبسي (2 د.أ).
  4. الديناميت زنجر (التحويل لوجبة): الساندويش بـ 1 د.أ، الوجبة بـ 2 د.أ.
  5. الوجبات العائلية: الاقتصادية (7 د.أ)، العائلية (10 د.أ)، العملاقة (14 د.أ).
  6. الشاورما: وجبة عادي (2 د.أ)، سوبر (2.75 د.أ)، دبل (3.25 د.أ).

  🚚 **قواعد التوصيل**:
  - يجب أن تسأل الزبون عن منطقته فوراً.
  - بمجرد معرفة المنطقة، أخبره بسعر التوصيل (مثلاً: تلاع العلي 2 د.أ، خلدا 2.5 د.أ).
  - إذا اختار "استلام"، سعر التوصيل يصبح 0.

  📋 **حالة الطلب الحالية**:
  الاسم: ${session.userName || "مطلوب"}
  الرقم: ${session.userPhone || "مطلوب"}
  العنوان: ${session.userAddress || "مطلوب"}
  الأصناف: ${session.pendingOrder?.items?.join(' + ') || "مطلوب"}

  ⚠️ **مهم جداً**:
  - ميز بدقة بين "زنجر" (1.5 ساندويش) وبين "ديناميت زنجر" (1 د.أ ساندويش).
  - لا ترسل [KITCHEN_GO] إلا إذا اكتملت (الاسم، الرقم، العنوان، الأصناف).
  - التنسيق الإجباري للمطبخ والزبون:
  [KITCHEN_GO]
  🔥 *طلب جديد مؤكد*
  - *الاسم*: [الاسم]
  - *الرقم*: [الرقم]
  - *النوع*: [توصيل أو استلام]
  - *العنوان*: [المنطقة بالتفصيل]
  - *الطلب*: [ذكر الأصناف بدقة]
  - *الحساب*: [سعر الأكل] + [التوصيل]
  - *المجموع*: [المجموع النهائي] د.أ
  `;
};

/* ================= المحرك الرئيسي ================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) {
    SESSIONS[chatId] = { history: [], pendingOrder: { items: [], total: 0, subtotal: 0, deliveryFee: 0 } };
  }
  const session = SESSIONS[chatId];

  let userMessage = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text;
  if (!userMessage) return;

  // تحديث البيانات تلقائياً (الرقم والاسم)
  const phone = extractPhone(userMessage);
  if (phone) session.userPhone = phone;

  // منطق تحويل "استلام" يدوياً لضمان الدقة
  if (userMessage.includes("استلام") || userMessage.includes("بالمحل")) {
    session.pendingOrder.type = "pickup";
    session.pendingOrder.deliveryFee = 0;
    session.userAddress = "استلام من المطعم";
  }

  try {
    // التحقق من التأكيد "تم"
    const isConfirmation = /^(تم|ok|اوكي|تمام|ايوا|تمم)$/i.test(userMessage.trim());
    if (session.awaitingConfirmation && isConfirmation) {
      const order = session.pendingOrder;
      // إرسال للمطبخ
      await sendWA(SETTINGS.KITCHEN_GROUP, session.lastKitchenMsg);
      // إرسال للزبون
      await sendWA(chatId, `أبشر يا غالي، طلبك اعتمدناه وصار بالمطبخ! نورت مطعم صابر 🙏`);
      delete SESSIONS[chatId];
      return;
    }

    // إرسال لـ OpenAI
    const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: getSystemPrompt(session) },
        ...session.history.slice(-10),
        { role: "user", content: userMessage }
      ],
      temperature: 0
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` }, timeout: 40000 });

    let reply = aiResponse.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      session.lastKitchenMsg = reply.split("[KITCHEN_GO]")[1].trim();
      session.awaitingConfirmation = true;
      await sendWA(chatId, `${reply.split("[KITCHEN_GO]")[0].trim()}\n\nأكتب "تم" لتأكيد الطلب ✅`);
    } else {
      await sendWA(chatId, reply);
    }

    session.history.push({ role: "user", content: userMessage }, { role: "assistant", content: reply });

  } catch (err) {
    console.error("Error:", err.message);
    await sendWA(chatId, "عذراً يا غالي، صار عندي عطل فني بسيط. ارجع ابعثلي شو بدك 🙏");
  }
});

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (err) {}
}

app.listen(3000, () => console.log("🤖 صابر جو سناك جاهز!"));
