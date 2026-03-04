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

const ORDER_GROUP_ID = "120363407952234395@g.us"

/* ======================== */
/* MENU */
/* ======================== */

const MENU = {

"ديناميت":1,
"صاروخ الشاورما":1.5,
"قنبلة رمضان":2.25,
"خابور كباب":2,

"وجبة زنجر":2,
"وجبة سكالوب":2,
"وجبة برجر":2,

"بطاطا":1,
"بطاطا عائلي":3,
"بطاطا جامبو":6

}

/* ======================== */
/* MEMORY */
/* ======================== */

const ORDERS = {}
const MEMORY = {}
const CUSTOMERS = {}

const MEMORY_LIMIT = 20

/* ======================== */
/* DELIVERY */
/* ======================== */

let DELIVERY = []

async function loadDelivery(){

if(DELIVERY.length === 0){

const res = await axios.get(DELIVERY_SHEET_URL)
DELIVERY = await csv().fromString(res.data)

}

}

/* ======================== */
/* NORMALIZE */
/* ======================== */

function normalize(text){

if(!text) return ""

return text
.toLowerCase()
.replace(/أ|إ|آ/g,"ا")
.replace(/ة/g,"ه")
.replace(/ى/g,"ي")
.trim()

}

/* ======================== */
/* ORDER */
/* ======================== */

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

/* ======================== */
/* CUSTOMER */
/* ======================== */

function getCustomer(user){

if(!CUSTOMERS[user]){

CUSTOMERS[user] = {
name:null,
phone:null
}

}

return CUSTOMERS[user]

}

/* ======================== */
/* FIND AREA */
/* ======================== */

function findArea(text){

const clean = normalize(text)

for(const row of DELIVERY){

const area = normalize(row.area)

if(clean.includes(area)) return row

}

return null

}

/* ======================== */
/* TOTAL */
/* ======================== */

function calculateTotal(order){

let total = 0

order.items.forEach(i=>{

total += (i.price * i.qty)

})

total += order.deliveryPrice

return total

}

/* ======================== */
/* ADD ITEM */
/* ======================== */

function addItem(order,name,qty=1){

if(!MENU[name]) return false

order.items.push({
name,
qty,
price:MENU[name]
})

return true

}

/* ======================== */
/* SEND WHATSAPP */
/* ======================== */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

}

/* ======================== */
/* SEND ORDER TO GROUP */
/* ======================== */

async function sendOrderToGroup(order,customer){

const items = order.items
.map(i=>`• ${i.name} × ${i.qty}`)
.join("\n")

const total = calculateTotal(order)

const text =

`🆕 طلب جديد

👤 ${customer.name}
📞 ${customer.phone}

🍔 الطلب
${items}

🚚 ${order.area}

💰 التوصيل ${order.deliveryPrice}
💵 المجموع ${total}`

await send(ORDER_GROUP_ID,text)

}

/* ======================== */
/* IMAGE UNDERSTANDING */
/* ======================== */

async function analyzeImage(url){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Identify the food item in the image from the menu only."
},
{
role:"user",
content:[
{type:"text",text:"what food is this"},
{type:"image_url",image_url:{url}}
]
}
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

/* ======================== */
/* WEBHOOK */
/* ======================== */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const chatId = req.body.senderData?.chatId

if(!chatId) return

const message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text

const order = getOrder(chatId)
const customer = getCustomer(chatId)

await loadDelivery()

/* ======================== */
/* AREA */
/* ======================== */

const area = findArea(message)

if(area){

order.area = area.area
order.deliveryPrice = Number(area.price)

await send(chatId,
`🚚 التوصيل: ${area.area}
السعر: ${area.price} دينار`)

return

}

/* ======================== */
/* ADD ORDER */
/* ======================== */

for(const item in MENU){

if(message.includes(item)){

addItem(order,item,1)

await send(chatId,
`تم إضافة ${item} 👍

بدك تضيف شي ثاني؟`)

return

}

}

/* ======================== */
/* PHONE */
/* ======================== */

const phoneMatch = message.match(/07\d{8}/)

if(phoneMatch){

customer.phone = phoneMatch[0]

customer.name = message.replace(phoneMatch[0],"").trim()

await send(chatId,"تم تسجيل الرقم 👍")

return

}

/* ======================== */
/* CONFIRM */
/* ======================== */

if(normalize(message).includes("تأكيد")){

if(!customer.phone){

await send(chatId,
"أرسل الاسم + رقم الهاتف لتأكيد الطلب")

return

}

await sendOrderToGroup(order,customer)

await send(chatId,"تم تأكيد الطلب 👍")

return

}

}catch(e){

console.log("BOT ERROR",e.message)

}

})

/* ======================== */

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})

app.listen(PORT,()=>{

console.log("🚀 Bot Running")

})
