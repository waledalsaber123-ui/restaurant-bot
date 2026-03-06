import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

/* ========= الإعدادات ========= */

const SETTINGS = {
  OPENAI_KEY: process.env.OPENAI_KEY,
  GREEN_TOKEN: process.env.GREEN_TOKEN,
  ID_INSTANCE: process.env.ID_INSTANCE,
  SHEET_URL: process.env.DELIVERY_SHEET_URL,
  GROUP_ID: "120363407952234395@g.us",
  API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ========= المنيو ========= */

const PRICES = {
  "ديناميت": 1,
  "صاروخ الشاورما": 1.5,
  "قنبلة رمضان": 2.25,
  "خابور كباب": 2,
  "زنجر": 1.5,
  "برجر": 1.5,
  "شاورما عادي": 1
};

/* ========= العروض ========= */

const OFFERS_TEXT = `
🔥 العروض الحالية 🔥

عرض 1
ديناميت + بطاطا + بيبسي = 2.5

عرض 2
صاروخ شاورما + بطاطا = 2

عرض 3
برجر + بطاطا + بيبسي = 2.25
`;

/* ========= تصحيح الأخطاء ========= */

const FIXES = {
  "دينمايت": "ديناميت",
  "ديناميتين": "ديناميت 2",
  "دينمايتين": "ديناميت 2",
  "برجرين": "برجر 2",
  "زنجرين": "زنجر 2",
  "صاروخين": "صاروخ الشاورما 2"
};

function normalize(text) {

  let t = text;

  Object.keys(FIXES).forEach(k => {
    t = t.replaceAll(k, FIXES[k]);
  });

  return t;
}

/* ========= الجلسات ========= */

const SESSIONS = {};
const LAST_MESSAGE = {};

/* ========= حساب التوصيل ========= */

async function getDeliveryPrice(areaText) {

  try {

    const res = await axios.get(SETTINGS.SHEET_URL);

    const data = await csv().fromString(res.data);

    const zone = data.find(d => areaText.includes(d.area.trim()));

    return zone ? parseFloat(zone.price) : 0;

  } catch {

    return 0;

  }

}

/* ========= إرسال واتساب ========= */

async function sendWA(chatId, message) {

  try {

    await axios.post(
      `${SETTINGS.API_URL}/sendMessage/${SETTINGS.GREEN_TOKEN}`,
      { chatId, message }
    );

  } catch {

    console.log("WA Error");

  }

}

/* ========= Webhook ========= */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  const body = req.body;

  if (body.typeWebhook !== "incomingMessageReceived") return;

  const chatId = body.senderData?.chatId;

  if (!chatId || chatId.endsWith("@g.us")) return;

  const text =
    body.messageData?.textMessageData?.textMessage ||
    body.messageData?.extendedTextMessageData?.text ||
    "";

  const cleanText = normalize(text.trim());

  if (!cleanText) return;

  if (LAST_MESSAGE[chatId] === cleanText) return;

  LAST_MESSAGE[chatId] = cleanText;

  if (!SESSIONS[chatId]) {

    SESSIONS[chatId] = {
      items: [],
      area: "",
      delivery: 0,
      total: 0
    };

  }

  const session = SESSIONS[chatId];

  /* ========= عرض العروض ========= */

  if (
    cleanText.includes("عرض") ||
    cleanText.includes("عروض")
  ) {

    await sendWA(chatId, OFFERS_TEXT);
    return;

  }

  /* ========= برومبت الذكاء ========= */

  const systemPrompt = `
أنت كاشير مطعم Saber Jo Snack.

المنيو:
${JSON.stringify(PRICES)}

القواعد:

- العميل قد يكتب عامية أو أخطاء
- صحح الكلمات تلقائياً
- تحدث باللهجة الأردنية
- لا تكتب كلام طويل

استخرج الأوامر فقط بالصيغة:

[ADD:اسم_الصنف:الكمية]

لو ذكر منطقة:

[AREA:اسم_المنطقة]

لو أكد الطلب:

[CONFIRM]
`;

  try {

    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: cleanText }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${SETTINGS.OPENAI_KEY}`
        }
      }
    );

    const content = aiRes.data.choices[0].message.content;

    /* ========= إضافة طلب ========= */

    if (content.includes("[ADD:")) {

      const matches = content.match(/\[ADD:(.*?):(\d+)\]/gi);

      matches?.forEach(m => {

        const parts = m.match(/\[ADD:(.*?):(\d+)\]/);

        const name = parts[1];
        const qty = parseInt(parts[2]);

        const price = PRICES[name] || 0;

        if (price > 0) {

          session.items.push({
            name,
            qty,
            price
          });

        }

      });

    }

    /* ========= المنطقة ========= */

    if (content.includes("[AREA:")) {

      const area = content.match(/\[AREA:(.*?)\]/)[1];

      session.area = area;

      session.delivery = await getDeliveryPrice(area);

    }

    /* ========= الحساب ========= */

    const itemsTotal = session.items.reduce(
      (sum, i) => sum + (i.price * i.qty),
      0
    );

    session.total = itemsTotal + session.delivery;

    /* ========= تأكيد الطلب ========= */

    if (content.includes("[CONFIRM]") && session.items.length > 0) {

      const summary = `
🚨 طلب جديد

العميل:
${chatId}

الطلب:
${JSON.stringify(session.items)}

المنطقة:
${session.area}

المجموع:
${session.total} دينار
`;

      await sendWA(SETTINGS.GROUP_ID, summary);

      await sendWA(chatId, "تم تأكيد طلبك يا غالي ✅");

      delete SESSIONS[chatId];

      return;

    }

    /* ========= الرد للعميل ========= */

    let reply = content.replace(/\[.*?\]/g, "").trim();

    if (session.total > 0) {

      reply += `\n\nالمجموع الحالي: ${session.total} دينار`;

    }

    await sendWA(chatId, reply);

  } catch {

    console.log("AI Error");

  }

});

/* ========= تشغيل السيرفر ========= */

app.listen(3000, () => {

  console.log("🚀 BOT RUNNING");

});
