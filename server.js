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
const CHAT_MEMORY = {};

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
/* CHAT MEMORY (14 messages) */
/* ========================= */

function addMemory(user,role,text){

if(!CHAT_MEMORY[user]){
CHAT_MEMORY[user] = [];
}

CHAT_MEMORY[user].push({
role,
content:text
})

if(CHAT_MEMORY[user].length > 14){
CHAT_MEMORY[user].shift()
}

}

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

addMemory(chatId,"assistant",message)

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

addMemory(chatId,"user",message)

const order = getOrder(chatId)

const text = message.trim()

/* ========================= */
/* HANDLE QUANTITY */
/* ========================= */

if(order.step === "waiting_qty" && /^[0-9]+$/.test(text)){

const qty = Number(text)

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
/* CALCULATE TOTAL */
/* ========================= */

if(
text.includes("كم") ||
text.includes("بطلع") ||
text.includes("المجموع")
){

if(order.items.length > 0){

let total = 0

order.items.forEach(i=>{
if(i.price && i.qty){
total += i.price * i.qty
}
})

await send(chatId,
`💰 المجموع الحالي:

${order.items.map(i=>`${i.name} × ${i.qty}`).join("\n")}

المجموع: ${total} دينار

بدك تضيف شي ثاني؟`
)

return

}

}

/* ========================= */
/* FINISH ORDER ITEMS */
/* ========================= */

if(order.step === "more"){

const lower = text.toLowerCase()

if(
lower.includes("بس") ||
lower.includes("خلص") ||
lower.includes("تمام")
){

await send(chatId,
"الطلب توصيل ولا استلام من المطعم؟"
)

order.step = "delivery"

return

}

}

/* ========================= */
/* AI RESPONSE */
/* ========================= */

const messages = [
{
role:"system",
content:SYSTEM_PROMPT
},
...(CHAT_MEMORY[chatId] || [])
]

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages
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
/* DETECT ITEM */
/* ========================= */

if(
reply.includes("تم إضافة") ||
reply.includes("تم اضافه")
){

const match = reply.match(/تم إضافة (.*)/)

if(match){

const itemName = match[1]

order.items.push({
name:itemName,
qty:0,
price:0
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
