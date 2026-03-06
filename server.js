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

// دالة لجلب الوقت بدقة لمنع الهلوسة في المواعيد
const getJordanTime = () => {
  return new Intl.DateTimeFormat('ar-JO', {
    timeZone: 'Asia/Amman',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date());
};

const getSystemPrompt = () => {
  return `
أنت "صابر". موظف استقبال مطعم شاورما أردني.
الوقت الآن في عمان: ${getJordanTime()}

⚠️ **قواعد صارمة لمنع الهلوسة**:
1. **ممنوع التكرار**: إذا العميل طلب صنف (مثل القنبلة أو الخابور)، لا تسأله "شو طلبك" مرة ثانية.
2. **ممنوع الترحيب المكرر**: لا تبعت "كيف بقدر أساعدك" إذا المحادثة أصلاً شغالة.
3. **الحجز**: الحجز متاح ومطلوب. إذا طلب العميل موعد مستقبلي، قوله "تم" واسأله عن الساعة.
4. **الصور**: إذا بعت صورة عرض، حللها فوراً ولا تنكر وجود العروض.
5. **الملخص**: احسب السعر النهائي (أصناف + توصيل) بدقة. طبربور 3 دنانير دائماً.
6. **التأكيد**: لما يثبت الطلب، ابعت [KITCHEN_GO] مع كل التفاصيل (الاسم، الموعد، العنوان، الأصناف).

📋 المنيو:
${SETTINGS.DYNAMIC_MENU}

🚚 التوصيل:
${SETTINGS.DYNAMIC_DELIVERY}
`;
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const chatId = body.senderData?.chatId;

  if (!chatId || chatId.endsWith("@g.us")) return;

  if (!SESSIONS[chatId]) SESSIONS[chatId] = [];
  
  let incomingText = "";
  let userMessageContent = [];

  // التعامل مع الصور (تحليل العروض)
  if (body.typeWebhook === "incomingFileMessageReceived" && body.messageData?.fileMessageData?.mimeType?.includes("image")) {
    userMessageContent.push({ type: "image_url", image_url: { url: body.messageData.fileMessageData.downloadUrl } });
    userMessageContent.push({ type: "text", text: "حلل هاي الصورة، هل هي عرض؟" });
    incomingText = "[صورة عرض]";
  } else {
    incomingText = body.messageData?.textMessageData?.textMessage || body.messageData?.extendedTextMessageData?.text || "";
    if (!incomingText) return;
    userMessageContent.push({ type: "text", text: incomingText });
  }

  try {
    const ai = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...SESSIONS[chatId].slice(-15), // تقليل الذاكرة لآخر 15 رسالة فقط لمنع التخبط
        { role: "user", content: userMessageContent }
      ],
      temperature: 0 // تصفير الـ temperature يمنع التأليف تماماً
    }, { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } });

    let reply = ai.data.choices[0].message.content;

    if (reply.includes("[KITCHEN_GO]")) {
      await sendWA(SETTINGS.KITCHEN_GROUP, reply.replace("[KITCHEN_GO]", "🔥 *طلب مؤكد*"));
      await sendWA(chatId, "أبشر، طلبك صار بالمطبخ ورح يوصلك عالموعد! 🙏");
      SESSIONS[chatId] = []; // تنظيف الذاكرة بعد الطلب بنجاح
      return;
    }

    await sendWA(chatId, reply);
    
    // تحديث الذاكرة بنص نظيف
    SESSIONS[chatId].push({ role: "user", content: incomingText });
    SESSIONS[chatId].push({ role: "assistant", content: reply });
  } catch (err) { console.error("AI Error"); }
});

async function sendWA(chatId, message) {
  try { await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message }); } catch (err) {}
}

app.listen(3000, () => console.log("Saber Fixed Version Live"));
