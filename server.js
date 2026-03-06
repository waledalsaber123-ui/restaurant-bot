import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

/* ========= ENV ========= */

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT

const GROUP_ID = "120363407952234395@g.us"

const API_URL = `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}`

/* ========= MEMORY ========= */

const SESSIONS = {}
const LAST_MESSAGE = {}

let DELIVERY = {}

/* ========= LOAD DELIVERY ========= */

async function loadDelivery(){

try{

const res = await axios.get(DELIVERY_SHEET_URL)

const rows = res.data.split("\n")

rows.forEach(r=>{

const [area,price] = r.split(",")

if(area){
DELIVERY[area.trim()] = Number(price)
}

})

console.log("Delivery zones loaded")

}catch(e){

console.log("Delivery load failed")

}

}

loadDelivery()

/* ========= WHATSAPP SEND ========= */

async function sendMessage(chatId,text){

await axios.post(
`${API_URL}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message:text
}
)

}

/* ========= AI ========= */

async function runAI(message){

try{

const res = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
temperature:0.2,
messages:[
{
role:"system",
content:SYSTEM_PROMPT
},
{
role:"user",
content:message
}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`,
"Content-Type":"application/json"
}
}
)

return res.data.choices[0].message.content

}catch(e){

console.log("AI ERROR")

return "أهلا يا غالي 👋 كيف فيني أساعدك؟"

}

}

/* ========= SUMMARY ========= */

function buildSummary(order){

const items = order.items.join("\n")

return `

🧾 ملخص الطلب

${items}

📍 العنوان
${order.address}

🚚 أجور التوصيل
${order.delivery}

💰 المجموع
${order.total}

اكتب:
تأكيد الطلب

`

}

/* ========= GROUP MESSAGE ========= */

function buildGroupMessage(order){

const items = order.items.join("\n")

return `

🚨 طلب جديد

📞 الهاتف
${order.phone}

📍 العنوان
${order.address}

🍔 الطلب
${items}

🚚 التوصيل
${order.delivery}

💰 المجموع
${order.total}

#${order.id}

`

}

/* ========= WEBHOOK ========= */

/* ========= WEBHOOK المصحح ========= */

app.post("/webhook", async (req, res) => {
    // 1. أهم خطوة: رد فوراً بـ 200 لمنع التكرار (Spam)
    res.sendStatus(200);

    const body = req.body;

    // تجاهل أي شيء ليس رسالة قادمة
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const chatId = body.senderData?.chatId;
    const text = body.messageData?.textMessageData?.textMessage || 
                 body.messageData?.extendedTextMessageData?.text; // دعم الرسائل من الأجهزة المرتبطة

    if (!chatId || !text || chatId.includes("@g.us")) return;

    // 2. منع معالجة نفس الرسالة مرتين (تحسين بسيط)
    if (LAST_MESSAGE[chatId] === text) return;
    LAST_MESSAGE[chatId] = text;

    // تهيئة الجلسة
    if (!SESSIONS[chatId]) {
        SESSIONS[chatId] = { id: "ORD" + Date.now(), phone: chatId, items: [], address: "", delivery: 0, total: 0 };
    }
    const order = SESSIONS[chatId];

    // 3. المنطق اليدوي (أسرع من الـ AI)
    if (text.includes("تأكيد")) {
        const msg = buildGroupMessage(order);
        await sendMessage(GROUP_ID, msg);
        await sendMessage(chatId, "تم تأكيد الطلب ✅");
        delete SESSIONS[chatId];
        return;
    }

    if (DELIVERY[text]) {
        order.address = text;
        order.delivery = DELIVERY[text];
        order.total = order.items.length + order.delivery; // ملاحظة: يفضل حساب الأسعار الحقيقية هنا
        await sendMessage(chatId, buildSummary(order));
        return;
    }

    // إضافة الأصناف يدوياً (حسب كودك)
    const itemsKeys = ["ديناميت", "شاورما", "زنجر", "برجر"];
    itemsKeys.forEach(key => {
        if (text.includes(key)) order.items.push(`${key} ×1`);
    });

    // 4. تشغيل الـ AI فقط إذا لم تكن رسالة "أمر" مباشرة
    try {
        const aiReply = await runAI(text);
        await sendMessage(chatId, aiReply);
    } catch (e) {
        console.log("AI Runtime Error");
    }
});

/* ignore events */

if(body.typeWebhook !== "incomingMessageReceived"){
return res.sendStatus(200)
}

const chatId = body.senderData?.chatId
const text = body.messageData?.textMessageData?.textMessage

if(!chatId || !text){
return res.sendStatus(200)
}

/* ignore groups */

if(chatId.includes("@g.us")){
return res.sendStatus(200)
}

/* prevent spam */

if(LAST_MESSAGE[chatId] === text){
return res.sendStatus(200)
}

LAST_MESSAGE[chatId] = text

/* create session */

if(!SESSIONS[chatId]){

SESSIONS[chatId] = {

id:"ORD"+Date.now(),
phone:chatId,
items:[],
address:"",
delivery:0,
total:0

}

}

const order = SESSIONS[chatId]

/* confirm order */

if(text.includes("تأكيد")){

const msg = buildGroupMessage(order)

await sendMessage(GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

delete SESSIONS[chatId]

return res.sendStatus(200)

}

/* detect delivery area */

if(DELIVERY[text]){

order.address = text

order.delivery = DELIVERY[text]

order.total = order.items.length + order.delivery

const summary = buildSummary(order)

await sendMessage(chatId,summary)

return res.sendStatus(200)

}

/* detect items */

if(text.includes("ديناميت")){
order.items.push("ديناميت ×1")
}

if(text.includes("شاورما")){
order.items.push("صاروخ شاورما ×1")
}

if(text.includes("زنجر")){
order.items.push("زنجر ×1")
}

if(text.includes("برجر")){
order.items.push("برجر ×1")
}

/* AI reply */

const aiReply = await runAI(text)

await sendMessage(chatId,aiReply)

res.sendStatus(200)

})

/* ========= SERVER ========= */

app.listen(3000,()=>{

console.log("BOT RUNNING")

})
