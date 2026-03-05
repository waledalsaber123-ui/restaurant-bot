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
const ORDER_GROUP_ID = process.env.ORDER_GROUP_ID

let DELIVERY = []

const ORDERS = {}
const CUSTOMERS = {}
const MEMORY = {}

const MEMORY_LIMIT = 30


/* ======================= */
/* LOAD DELIVERY */
/* ======================= */

async function loadDelivery(){

if(DELIVERY.length === 0){

const res = await axios.get(DELIVERY_SHEET_URL)
DELIVERY = await csv().fromString(res.data)

}

}


/* ======================= */
/* MEMORY */
/* ======================= */

function addMemory(user,role,text){

if(!MEMORY[user]) MEMORY[user] = []

MEMORY[user].push({role,content:text})

if(MEMORY[user].length > MEMORY_LIMIT){
MEMORY[user].shift()
}

}


/* ======================= */
/* NORMALIZE */
/* ======================= */

function normalize(text){

if(!text) return ""

return text
.toLowerCase()
.replace(/أ|إ|آ/g,"ا")
.replace(/ة/g,"ه")
.replace(/ى/g,"ي")
.trim()

}


/* ======================= */
/* FIND AREA */
/* ======================= */

function findArea(text){

const clean = normalize(text)

for(const row of DELIVERY){

const area = normalize(row.area)

if(clean.includes(area) || area.includes(clean)){
return row
}

}

return null

}


/* ======================= */
/* ORDER */
/* ======================= */

function getOrder(user){

if(!ORDERS[user]){

ORDERS[user] = {
items:[],
area:null,
deliveryPrice:0
}

}

return ORDERS[user]

}


/* ======================= */
/* CUSTOMER */
/* ======================= */

function getCustomer(user){

if(!CUSTOMERS[user]){

CUSTOMERS[user] = {
name:null,
phone:null
}

}

return CUSTOMERS[user]

}


/* ======================= */
/* PHONE */
/* ======================= */

function extractPhone(text){

if(!text) return null

const match = text.match(/07\d{8}/)

if(match) return match[0]

return null

}


/* ======================= */
/* TOTAL */
/* ======================= */

function calculateTotal(order){

let total = 0

order.items.forEach(i=>{

total += (Number(i.price)||0) * (Number(i.qty)||1)

})

total += Number(order.deliveryPrice||0)

return total

}


/* ======================= */
/* SEND WHATSAPP */
/* ======================= */

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


/* ======================= */
/* SEND ORDER TO GROUP */
/* ======================= */

async function sendOrderToGroup(order,customer){

const total = calculateTotal(order)

const items = order.items
.map(i=>`• ${i.name} ×${i.qty}`)
.join("\n")

const text =

`🆕 طلب جديد

👤 ${customer.name}
📞 ${customer.phone}

📦 الطلب:
${items}

🚚 المنطقة: ${order.area}

💰 التوصيل: ${order.deliveryPrice} دينار
💵 المجموع: ${total} دينار`

await send(ORDER_GROUP_ID,text)

}


/* ======================= */
/* AI */
/* ======================= */

async function askAI(chatId,message){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{role:"system",content:SYSTEM_PROMPT},
...(MEMORY[chatId]||[]),
{role:"user",content:message}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

return ai.data.choices[0].message.content

}


/* ======================= */
/* WEBHOOK */
/* ======================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const message =
req.body.messageData?.extendedTextMessageData?.text ||
req.body.messageData?.textMessageData?.textMessage ||
""

const chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.includes("@g.us")) return

await loadDelivery()

const order = getOrder(chatId)
const customer = getCustomer(chatId)

addMemory(chatId,"user",message)


/* ======================= */
/* PHONE */
/* ======================= */

const phone = extractPhone(message)

if(phone){

customer.phone = phone

const name = message.replace(phone,"").trim()

if(name) customer.name = name

await send(chatId,"تم تسجيل رقم الهاتف 👍")

return

}


/* ======================= */
/* AREA */
/* ======================= */

const area = findArea(message)

if(area){

order.area = area.area
order.deliveryPrice = Number(area.price)

await send(chatId,
`🚚 التوصيل: ${area.area}
💰 السعر: ${area.price} دينار`)

return

}


/* ======================= */
/* CONFIRM ORDER */
/* ======================= */

if(normalize(message).includes("تأكيد")){

if(!customer.name || !customer.phone){

await send(chatId,
"أرسل الاسم + رقم الهاتف لتأكيد الطلب")

return

}

await sendOrderToGroup(order,customer)

await send(chatId,
"✅ تم تأكيد الطلب. شكراً لك 🙏")

return

}


/* ======================= */
/* TOTAL */
/* ======================= */

if(normalize(message).includes("المجموع")){

const total = calculateTotal(order)

await send(chatId,
`💰 المجموع: ${total} دينار`)

return

}


/* ======================= */
/* AI RESPONSE */
/* ======================= */

const reply = await askAI(chatId,message)

await send(chatId,reply)

}catch(e){

console.log("BOT ERROR:",e.response?.data || e.message)

}

})


/* ======================= */
/* ROOT */
/* ======================= */

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running 🚀")

})


/* ======================= */
/* START */
/* ======================= */

app.listen(PORT,()=>{

console.log(`🚀 Bot Running on port ${PORT}`)

})
