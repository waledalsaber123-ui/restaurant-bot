import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  KITCHEN_GROUP: "120363407952234395@g.us", // جروب المطبخ
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

const SESSIONS = {};

async function sendWA(chatId, message) {
  try {
    await axios.post(`${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`, { chatId, message });
  } catch (e) { console.log("خطأ إرسال واتساب"); }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;
  if (!chatId || chatId.endsWith("@g.us")) return;

  const text = body.messageData?.textMessageData?.textMessage || 
               body.messageData?.extendedTextMessageData?.text || "";

  if (!text.trim()) return;
  if (!SESSIONS[chatId]) SESSIONS[chatId] = { history: [] };
  const session = SESSIONS[chatId];

  // سحب كل شيء (المنيو + أسعار التوصيل + الموقع) من البرومبت فقط
  const dynamicPrompt = process.env.SYSTEM_PROMPT; 

  try {
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: dynamicPrompt }, 
          ...session.history.slice(-3), // ذاكرة قصيرة لضمان التركيز
          { role: "user", content: text }
        ],
        temperature: 0 // للالتزام الحرفي بالتعليمات ومنع الهلوسة
      },
      { headers: { Authorization: `Bearer ${SETTINGS.OPENAI_KEY}` } }
    );

    let aiReply = aiRes.data.choices[0].message.content;

    // ترحيل للجروب المذكور (120363407952234395@g.us) عند التأكيد
    if (aiReply.includes("[KITCHEN_GO]")) {
      const finalOrder = aiReply.replace("[KITCHEN_GO]", "").trim();
      await sendWA(SETTINGS.KITCHEN_GROUP, finalOrder); 
      await sendWA(chatId, "أبشر يا غالي، طلبك صار بالمطبخ! ✅");
      delete SESSIONS[chatId];
      return;
    }

    const cleanReply = aiReply.replace(/\[.*?\]/g, "").trim();
    if (cleanReply) {
      await sendWA(chatId, cleanReply);
      session.history.push({ role: "user", content: text }, { role: "assistant", content: cleanReply });
    }

  } catch (err) { console.log("AI Error"); }
});

app.listen(3000);
