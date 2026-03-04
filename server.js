import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;

/* ========================= */
/* ORDER MEMORY */
/* ========================= */

const ORDERS = {};

function getOrder(user){

if(!ORDERS[user]){

ORDERS[user] = {
items:[],
step:"start"
};

}

return ORDERS[user];

}

/* ========================= */
/* WORKING HOURS CHECK */
/* ========================= */


/* ========================= */
/* SEND MESSAGE */
/* ========================= */

async function send(chatId,message){

try{

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

}catch(e){

console.log("GreenAPI ERROR:",e.response?.data || e.message)

}

}

/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const message =
req.body.messageData?.extendedTextMessageData?.text ||
req.body.messageData?.textMessageData?.textMessage

let chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.includes("@g.us")) return

console.log("Incoming:",message)

/* ========================= */
/* CHECK WORKING HOURS */
/* ========================= */

if(restaurantClosed()){

await send(chatId,
`⛔ المطعم مغلق حالياً

أوقات العمل من 2 عصراً حتى 3:30 فجراً بسبب رمضان.

ما عنا فروع غير شارع الجامعة عمان.`)

return
}

/* ========================= */
/* ORDER MEMORY */
/* ========================= */

const order = getOrder(chatId)

/* ========================= */
/* HANDLE QUANTITY */
/* ========================= */

if(order.step === "waiting_qty" && !isNaN(message)){

const qty = Number(message)

const last = order.items[order.items.length-1]

last.qty = qty

await send(chatId,
`👍 تمام

${last.name} × ${qty}

بدك تضيف شي ثاني ولا بس هيك؟`
)

order.step = "more"

return
}

/* ========================= */
/* FINISH ORDER ITEMS */
/* ========================= */

if(order.step === "more"){

const text = message.toLowerCase()

if(
text.includes("بس") ||
text.includes("خلص") ||
text.includes("تمام")
){

await send(chatId,
"الطلب توصيل ولا استلام من المطعم؟"
)

order.step = "delivery"

return

}

}

/* ========================= */
/* AI UNDERSTANDING */
/* ========================= */

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
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

const reply = ai.data.choices[0].message.content

console.log("AI:",reply)

/* ========================= */
/* DETECT ADDED ITEM */
/* ========================= */

if(
reply.includes("تم إضافة") ||
reply.includes("تم اضافه") ||
reply.includes("Added")
){

const match = reply.match(/تم إضافة (.*)/)

if(match){

const itemName = match[1]

order.items.push({
name:itemName
})

order.step="waiting_qty"

}

}

/* ========================= */
/* SEND REPLY */
/* ========================= */

await send(chatId,reply)

}catch(e){

console.log("BOT ERROR:",e.response?.data || e.message)

}

})

/* ========================= */
/* ROOT */
/* ========================= */

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running 🚀")

})

/* ========================= */
/* START SERVER */
/* ========================= */

app.listen(PORT,()=>{

console.log(`🚀 Restaurant Bot Running on port ${PORT}`)

})
