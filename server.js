import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: process.env.KITCHEN_GROUP || "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
  DYNAMIC_MENU: process.env.RESTAURANT_MENU, 
  DYNAMIC_DELIVERY: process.env.DELIVERY_PRICES
};

const SESSIONS = {};

const getJordanTime = () => {
  return new Intl.DateTimeFormat('ar-JO', {
    timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', hour12: true,
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
};

const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال مطعم شاورما أردني.
الوقت الآن: ${getJordanTime()}

⚠️ **أوامر برمجية صارمة لمنع التكرار**:
1. **لا ترحب مرتين**: إذا العميل أصلاً بيطلب، كمل معه ولا تعيد "أهلين كيف بقدر أساعدك".
2. **الذاكرة**: تذكر الأصناف (قنبلة، خابور، زنجر). إذا حددها، لا ترجع تسأل "شو طلبك".
3. **الحجز**: متاح. إذا طلب حجز لموعد لاحق، ثبته فوراً.
4. **الصور**: حلل الصورة فوراً كعرض أو طلب.
5. **الملخص**: السعر النهائي شامل التوصيل (طبربور دائماً 3د).
6. **النهاية**: أرسل [KITCHEN_GO] فقط عند التأكيد النهائي.

📋 المنيو: ${SETTINGS.DYNAMIC_MENU}
🚚 التوصيل: ${SETTINGS.DYNAMIC_DELIVERY}
`;
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const chatId = body.senderData?.chatId;

  // 1. تجاهل الجروبات والرسائل التلقائية (منع التكرار اللانهائي)
  if (!chatId || chatId.endsWith("@g.us") || body.senderData?.senderName === "رسالة تلقائية") return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = [];
  
  let userContent = [];
  let logText = "";

  // 2. فحص نوع الرسالة (صورة أو نص)
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userContent.push({ type: "text", text: "حلل الصورة للطلب." });
    logText = "[صورة]";
  } else {
    logText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    if (!logText || logText.includes("عرض التفاصيل")) return; // تجاهل رسائل النظام
    userContent.push({ type: "text", text: logText });
  }

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...SESSIONS[chatId].slice(-10), // الاحتفاظ بآخر 10 رسائل فقط لتركيز الذاكرة
        { role: "user", content: userContent }
      ],
      temperature: 0 // تصفير الحرارة لمنع الهلوسة والتكرار
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    // 3. منع إرسال رسائل ترحيبية إذا كانت المحادثة مستمرة
    if (SESSIONS[chatId].length > 0 && (reply.includes("أهلين") || reply.includes("بقدر أساعدك"))) {
       reply = reply.replace(/أهلين.*ساعدك؟/g, "").trim(); 
       if (!reply) return; // منع إرسال رسالة فارغة
    }

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔔 *طلب مؤكد*"));
      await sendWA(chatId, "تم تثبيت طلبك يا غالي، نورتنا! 🙏");
      SESSIONS[chatId] = [];
      return;
    }

    await sendWA(chatId, reply);
    SESSIONS[chatId].push({ role: "user", content: logText }, { role: "assistant", content: reply });
  } catch (err) { console.error("AI Error Logged"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Loop-Fix Active"));
