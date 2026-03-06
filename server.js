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

const OFFERS = {
  "عرض 1": "ديناميت + بطاطا + بيبسي = 2.5",
  "عرض 2": "صاروخ شاورما + بطاطا = 2",
  "عرض 3": "برجر + بطاطا + بيبسي = 2.25"
};

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

  } catch (e) {

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

  } catch (e) {

    console.log("WA Error");

  }

}

/* ========= Webhook ========= */

app.post("/webhook", async (req, res) => {

  res.sendStatus(200);

  const body = req.body;

  if (
    body.typeWebhook !== "incomingMessageReceived" ||
    body.messageData?.typeMessage !== "textMessage"
  ) return;

  const chatId = body.senderData?.chatId;

  const text =
    body.messageData?.textMessageData?.textMessage ||
    body.messageData?.extendedTextMessageData?.text ||
    "";

  if (!chatId || chatId.includes("@g.us")) return;

  const cleanText = normalize(text.trim());

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
