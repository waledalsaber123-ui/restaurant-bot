import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

/* ================= CONFIG ================= */

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL

const GROUP_ID = "120363407952234395@g.us"

const API_URL = `https://7103.api.greenapi.com/waInstance${ID_INSTANCE}`

/* ================= MEMORY ================= */

const SESSIONS = {}

let DELIVERY = {}

/* ================= LOAD DELIVERY ================= */

async function loadDelivery(){

try{

const res = await axios.get(DELIVERY_SHEET_URL)

const rows = res.data.split("\n")

rows.forEach(r=>{

const [area,price] = r.split(",")

if(area) DELIVERY[area.trim()] = Number(price)

})

console.log("Delivery zones loaded")

}catch(e){

console.log("Delivery sheet error",e.message)

}

}

loadDelivery()

/* ================= SEND MESSAGE ================= */

async function sendMessage(chatId,text){

await axios.post(

`${API_URL}/sendMessage/${GREEN_TOKEN}`,

{
chatId,
message:text
}

)

}

/* ================= OPENAI ================= */

async function runAI(message){

try{

const response = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
temperature:0,
messages:[
{
role:"system",
content:`
انت مساعد طلبات لمطعم.

مهم:
لا تخترع اصناف او اسعار.

ارجع JSON فقط:

{
intent:"",
items:[],
reply:""
}

intent:

order
confirm
address
question
`
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

const text = response.data.choices[0].message.content

console.log("AI RESPONSE:",text)

try{

return JSON.parse(text)

}catch{

return {
intent:"question",
items:[],
reply:text
}

}

}catch(err){

console.log("AI ERROR:",err.response?.data || err.message)

return {
intent:"question",
items:[],
reply:"أهلا يا غالي 👋 كيف فيني أساعدك؟"
}

}

}

/* ================= BUILD SUMMARY ================= */

function buildSummary(order){

const items = order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

return `

🧾 ملخص الطلب

${items}

📍 العنوان
${order.address}

🚚 أجور التوصيل
${order.delivery}

💰 المجموع
${order.total}

اكتب "تأكيد الطلب" لتثبيت الطلب

`

}

/* ================= GROUP MESSAGE ================= */

function buildGroupMessage(order){

const items = order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

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

/* ================= WEBHOOK ================= */

app.post("/webhook",async(req,res)=>{

const body = req.body

const chatId = body.senderData?.chatId
const text = body.messageData?.textMessageData?.textMessage

if(!chatId) return res.sendStatus(200)

/* ignore groups */

if(chatId.includes("@g.us")) return res.sendStatus(200)

/* create session */

if(!SESSIONS[chatId]){

SESSIONS[chatId]={

id:"ORD"+Date.now(),
phone:chatId,
items:[],
address:"",
delivery:0,
total:0

}

}

const order = SESSIONS[chatId]

/* run AI */

const ai = await runAI(text)

/* reply */

if(ai.reply){

await sendMessage(chatId,ai.reply)

}

/* add items */

if(ai.intent==="order"){

ai.items.forEach(i=>{

order.items.push(i)

})

}

/* address */

if(ai.intent==="address"){

order.address = text

order.delivery = DELIVERY[text] || 0

order.total = order.items.length + order.delivery

const summary = buildSummary(order)

await sendMessage(chatId,summary)

}

/* confirm */

if(ai.intent==="confirm"){

const msg = buildGroupMessage(order)

await sendMessage(GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

}

res.sendStatus(200)

})

/* ================= SERVER ================= */

app.listen(3000,()=>{

console.log("BOT RUNNING")

})
