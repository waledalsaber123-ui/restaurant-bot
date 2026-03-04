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

const ORDER_GROUP_ID = "120363407952234395@g.us"


/* ========================= */
/* MENU */
/* ========================= */

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


/* ========================= */
/* OFFERS */
/* ========================= */

const OFFERS = [

"🔥 جرب تضيف ديناميت 45سم بس 1 دينار",
"🔥 كثير ناس يضيفوا صاروخ الشاورما مع الطلب",
"🔥 قنبلة رمضان 250غ بس 2.25 دينار"

]


/* ========================= */
/* MEMORY */
/* ========================= */

const ORDERS = {}
const CUSTOMERS = {}

let DELIVERY = []


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
/* NORMALIZE */
/* ========================= */

function normalize(text){

if(!text) return ""

return text
.toLowerCase()
.replace(/أ|إ|آ/g,"ا")
.replace(/ة/g,"ه")
.replace(/ى/g,"ي")

}


/* ========================= */
/* ORDER MEMORY */
/* ========================= */

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
/* ADD ITEM */
/* ========================= */

function addItem(order,name,qty=1){

if(!MENU[name]) return false

order.items.push({
name,
qty,
price:MENU[name]
})

return true

}


/* ========================= */
/* TOTAL */
/* ========================= */

function calculateTotal(order){

let total = 0

order.items.forEach(i=>{

total += i.price * i.qty

})

total += order.deliveryPrice

return total

}


/* ========================= */
/* FIND AREA */
/* ========================= */

function findArea(text){

const clean = normalize(text)

for(const row of DELIVERY){

const area = normalize(row.area)

if(clean.includes(area)) return row

}

return null

}


/* ========================= */
/* SEND MESSAGE */
/* ========================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

}


/* ========================= */
/* AI ORDER UNDERSTANDING */
/* ========================= */

async function extractOrder(text){

try{

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Extract food order as JSON.

Return format:

{
items:[
{name:"item",qty:number}
]
}

Menu items:
ديناميت
صاروخ الشاورما
قنبلة رمضان
خابور كباب
وجبة زنجر
وجبة سكالوب
وجبة برجر
بطاطا
بطاطا عائلي
بطاطا جامبو`
},
{
role:"user",
content:text
}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

return JSON.parse(ai.data.choices[0].message.content)

}catch{

return null

}

}


/* ========================= */
/* IMAGE ANALYSIS */
/* ========================= */

async function analyzeImage(url){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Identify the food item from the menu.

Return only the name.

Menu:
ديناميت
صاروخ الشاورما
قنبلة رمضان
خابور كباب
وجبة زنجر
وجبة سكالوب
وجبة برجر
بطاطا`
},
{
role:"user",
content:[
{type:"text",text:"what item is this"},
{type:"image_url",image_url:{url:url}}
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

return ai.data.choices[0].message.content.trim()

}


/* ========================= */
/* SEND ORDER TO GROUP */
/* ========================= */

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


/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const chatId = req.body.senderData?.chatId

if(!chatId) return


let message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""


let imageUrl = null

if(req.body.messageData?.fileMessageData){

imageUrl = req.body.messageData.fileMessageData.downloadUrl

}


const order = getOrder(chatId)
const customer = getCustomer(chatId)

await loadDelivery()


/* ========================= */
/* IMAGE */
/* ========================= */

if(imageUrl){

const item = await analyzeImage(imageUrl)

if(MENU[item]){

addItem(order,item,1)

await send(chatId,
`تم إضافة ${item} 👍

${OFFERS[Math.floor(Math.random()*OFFERS.length)]}`)

}

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
/* ORDER TEXT */
/* ========================= */

const result = await extractOrder(message)

if(result && result.items){

for(const item of result.items){

if(MENU[item.name]){

addItem(order,item.name,item.qty || 1)

}

}

await send(chatId,
`تم إضافة الطلب 👍

${OFFERS[Math.floor(Math.random()*OFFERS.length)]}`)

return

}


/* ========================= */
/* PHONE */
/* ========================= */

const phoneMatch = message.match(/07\d{8}/)

if(phoneMatch){

customer.phone = phoneMatch[0]

customer.name = message.replace(phoneMatch[0],"").trim()

await send(chatId,"تم تسجيل الرقم 👍")

return

}


/* ========================= */
/* CONFIRM */
/* ========================= */

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

console.log("BOT ERROR:",e.response?.data || e.message)

}

})


app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})


app.listen(PORT,()=>{

console.log("🚀 Bot Running")

})
