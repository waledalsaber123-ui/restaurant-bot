import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

/* ========= ENV ========= */

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL

const GROUP_ID = "120363407952234395@g.us"

const API_URL = `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}`

/* ========= MEMORY ========= */

const SESSIONS = {}
let DELIVERY = {}

/* ========= LOAD DELIVERY ========= */

async function loadDelivery(){

try{

const res = await axios.get(DELIVERY_SHEET_URL)

const rows = res.data.split("\n")

rows.forEach(r=>{

const [area,price] = r.split(",")

if(area) DELIVERY[area.trim()] = Number(price)

})

console.log("Delivery zones loaded")

}catch{

console.log("Delivery sheet failed")

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
temperature:0.3,
messages:[
{
role:"system",
content:"انت مساعد طلبات لمطعم. رد بشكل طبيعي ومختصر."
},
{
role:"user",
content:message
}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

return res.data.choices[0].message.content

}catch{

return "أهلا يا غالي 👋 شو بتحب تطلب؟"

}

}

/* ========= ORDER SUMMARY ========= */

function buildSummary(order){

const items = order.items.join("\n")

return `
🧾 ملخص الطلب

${items}

📍 العنوان
${order.address}

🚚 التوصيل
${order.delivery}

💰 المجموع
${order.total}

اكتب: تأكيد الطلب
`

}

/* ========= GROUP MESSAGE ========= */

function buildGroup(order){

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

app.post("/webhook",async(req,res)=>{

const body = req.body

const chatId = body.senderData?.chatId
const text = body.messageData?.textMessageData?.textMessage

if(!chatId) return res.sendStatus(200)

/* ignore groups */

if(chatId.includes("@g.us")) return res.sendStatus(200)

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

if(text?.includes("تأكيد")){

const msg = buildGroup(order)

await sendMessage(GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

return res.sendStatus(200)

}

/* detect address */

if(DELIVERY[text]){

order.address = text
order.delivery = DELIVERY[text]

order.total = order.items.length + order.delivery

const summary = buildSummary(order)

await sendMessage(chatId,summary)

return res.sendStatus(200)

}

/* AI reply */

const aiReply = await runAI(text)

await sendMessage(chatId,aiReply)

/* simple order detect */

if(text?.includes("ديناميت")){

order.items.push("ديناميت ×1")

}

if(text?.includes("شاورما")){

order.items.push("شاورما ×1")

}

res.sendStatus(200)

})

/* ========= SERVER ========= */

app.listen(3000,()=>{

console.log("BOT RUNNING")

})
