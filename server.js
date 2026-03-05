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
const RESTAURANT_PHONE = "0790000000"


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
/* MENU IMAGES */
/* ========================= */

const MENU_IMAGES = {

"خابور كباب":"https://i.imgur.com/lhWRxlO.jpg",
"الوجبة العملاقة سناكات":"https://i.imgur.com/YBdJtXk.jpg",
"الوجبة العائلية سناكات":"https://i.imgur.com/6uzbeo4.jpg",
"الوجبة الاقتصادية سناكات":"https://i.imgur.com/pvBkKto.jpg",
"وجبة زنجر":"https://i.imgur.com/wgjBv86.jpg",
"قنبلة رمضان":"https://i.imgur.com/NrPMh4h.jpg",
"الوجبة الاقتصادية شاورما":"https://i.imgur.com/rmq4PS0.jpg",
"صاروخ الشاورما":"https://i.imgur.com/KpajIR8.jpg",
"زنجر ديناميت":"https://i.imgur.com/sZhwxXE.jpg",
"الشاورما العائلية":"https://i.imgur.com/tZedL2M.jpg",
"وجبة برجر":"https://i.imgur.com/9S1VGKX.jpg",
"وجبة سكالوب":"https://i.imgur.com/CEdT5cx.jpg",
"وجبات الشاورما الفردية":"https://i.imgur.com/FaZvkHe.jpg"

}


/* ========================= */
/* MEMORY */
/* ========================= */

const ORDERS = {}

let DELIVERY = []
let LAST_FETCH = 0


/* ========================= */
/* LOAD DELIVERY */
/* ========================= */

async function loadDelivery(){

const now = Date.now()

if(now - LAST_FETCH < 600000 && DELIVERY.length > 0) return

const res = await axios.get(DELIVERY_SHEET_URL)

DELIVERY = await csv().fromString(res.data)

LAST_FETCH = now

}


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

function addItem(order,name,qty=1){

if(!MENU[name]) return false

const existing = order.items.find(i=>i.name===name)

if(existing){

existing.qty += qty

}else{

order.items.push({
name,
qty,
price:MENU[name]
})

}

return true

}


/* ========================= */

function calculateTotal(order){

let total = 0

order.items.forEach(i=>{
total += i.qty * i.price
})

total += order.deliveryPrice

return total

}


/* ========================= */

function orderSummary(order){

const items = order.items.map(i=>`• ${i.name} × ${i.qty}`).join("\n")

const total = calculateTotal(order)

return `

🍔 طلبك الحالي

${items}

🚚 التوصيل: ${order.area || "لم يتم تحديد المنطقة"}

💵 المجموع: ${total} دينار
`

}


/* ========================= */

function upsell(){

return "🔥 كثير من الزبائن يضيفون بطاطا أو صاروخ شاورما مع الطلب"
}


/* ========================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
})

}


/* ========================= */

async function sendImage(chatId,url,caption=""){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendFileByUrl/${GREEN_TOKEN}`,
{
chatId,
urlFile:url,
fileName:"menu.jpg",
caption
})

}


/* ========================= */
/* AI ORDER */
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
content:`Extract food order JSON

Return:
{items:[{name:"",qty:1}]}

Menu:
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
{role:"user",content:text}
]
},
{
headers:{Authorization:`Bearer ${OPENAI_KEY}`}
}
)

return JSON.parse(ai.data.choices[0].message.content)

}catch{

return null

}

}


/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req,res)=>{

console.log("===== WEBHOOK RECEIVED =====")
console.log(JSON.stringify(req.body,null,2))

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const chatId = req.body.senderData?.chatId

if(!chatId) return

if(chatId.endsWith("@g.us")) return
if(req.body.senderData?.isSender) return


let message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""


const order = getOrder(chatId)

await loadDelivery()


/* ========================= */
/* MENU REQUEST */
/* ========================= */

if(normalize(message).includes("منيو")){

for(const item in MENU_IMAGES){

await sendImage(chatId,MENU_IMAGES[item],item)

}

return

}


/* ========================= */
/* AREA */
/* ========================= */

for(const row of DELIVERY){

if(normalize(message).includes(normalize(row.area))){

order.area = row.area
order.deliveryPrice = Number(row.price)

await send(chatId,orderSummary(order))

return

}

}


/* ========================= */
/* ORDER */
/* ========================= */

const result = await extractOrder(message)

if(result && result.items){

for(const item of result.items){

if(MENU[item.name]){

addItem(order,item.name,item.qty||1)

if(MENU_IMAGES[item.name]){

await sendImage(chatId,MENU_IMAGES[item.name],item.name)

}

}

}

await send(chatId,

`${orderSummary(order)}

${upsell()}`)

}

}catch(e){

console.log("BOT ERROR:",e.message)

}

})


/* ========================= */
/* ROOT */
/* ========================= */

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})


app.listen(PORT,()=>{

console.log("🚀 BOT RUNNING")

})
