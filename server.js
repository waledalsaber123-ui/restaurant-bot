import express from "express"
import axios from "axios"
import csv from "csvtojson"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT

let DELIVERY = []

const ORDERS = {}
const MEMORY = {}
const CUSTOMERS = {}

const MEMORY_LIMIT = 40


/* ========================= */
/* LOAD DELIVERY */
/* ========================= */

async function loadDelivery(){

if(DELIVERY.length === 0){

const res = await axios.get(DELIVERY_SHEET_URL)
DELIVERY = await csv().fromString(res.data)

}

}


/* ========================= */
/* MEMORY */
/* ========================= */

function addMemory(user,role,text){

if(!MEMORY[user]) MEMORY[user] = []

MEMORY[user].push({
role,
content:text
})

if(MEMORY[user].length > MEMORY_LIMIT){
MEMORY[user].shift()
}

}


/* ========================= */
/* NORMALIZE */
/* ========================= */

function normalize(text){

return text
.toLowerCase()
.replace(/أ|إ|آ/g,"ا")
.replace(/ة/g,"ه")
.replace(/ى/g,"ي")
.trim()

}


/* ========================= */
/* FIND AREA */
/* ========================= */

function findArea(text){

const clean = normalize(text)

for(const row of DELIVERY){

const area = normalize(row.area)

if(clean.includes(area) || area.includes(clean)){
return row
}

const words = area.split(" ")

for(const w of words){

if(w.length > 3 && clean.includes(w)){
return row
}

}

}

return null

}


/* ========================= */
/* ORDER */
/* ========================= */

function getOrder(user){

if(!ORDERS[user]){

ORDERS[user] = {
items:[],
deliveryPrice:0,
area:null
}

}

return ORDERS[user]

}


/* ========================= */
/* CUSTOMER */
/* ========================= */

function getCustomer(user){

if(!CUSTOMERS[user]){

CUSTOMERS[user] = {
name:null,
phone:null
}

}

return CUSTOMERS[user]

}


/* ========================= */
/* PHONE */
/* ========================= */

function extractPhone(text){

const phone = text.match(/07\d{8}/)

if(phone) return phone[0]

return null

}


/* ========================= */
/* TOTAL */
/* ========================= */

function calculateTotal(order){

let total = 0

order.items.forEach(item=>{

const price = Number(item.price || 0)
const qty = Number(item.qty || 1)

total += price * qty

})

total += Number(order.deliveryPrice || 0)

return total

}


/* ========================= */
/* SEND */
/* ========================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

addMemory(chatId,"assistant",message)

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

addMemory(chatId,"user",message)

await loadDelivery()

const order = getOrder(chatId)
const customer = getCustomer(chatId)


/* ========================= */
/* PHONE */
/* ========================= */

const phone = extractPhone(message)

if(phone){

customer.phone = phone

const name = message.replace(phone,"").trim()

if(name.length > 1){
customer.name = name
}

await send(chatId,
`تمام يا ${customer.name || "غالي"} 👍

تم تسجيل الرقم:
${customer.phone}`)

return

}


/* ========================= */
/* AREA */
/* ========================= */

const area = findArea(message)

if(area){

order.area = area.area
order.deliveryPrice = Number(area.price)

await send(chatId,
`🚚 التوصيل: ${area.area}
السعر: ${area.price} دينار`)

return

}


/* ========================= */
/* TOTAL */
/* ========================= */

const text = normalize(message)

if(
text.includes("المجموع") ||
text.includes("كم") ||
text.includes("كم بطلع")
){

if(!customer.phone){

await send(chatId,
`أرسل الاسم + رقم الهاتف لتأكيد الطلب

مثال:
وليد 0791234567`)

return
}

const total = calculateTotal(order)

await send(chatId,
`🧾 ملخص الطلب

${order.items.map(i=>`• ${i.name} ×${i.qty}`).join("\n")}

🚚 ${order.area || "غير محدد"}

💰 المجموع: ${total} دينار

👤 ${customer.name}
📞 ${customer.phone}`)

return

}


/* ========================= */
/* AI */
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
...(MEMORY[chatId] || [])
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

const reply = ai.data.choices[0].message.content

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
/* START */
/* ========================= */

app.listen(PORT,()=>{

console.log(`🚀 Restaurant Bot Running on port ${PORT}`)

})
