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

/* ======================= */
/* MENU */
/* ======================= */

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

/* ======================= */
/* IMAGES */
/* ======================= */

const MENU_IMAGES = {
"خابور كباب":"https://i.imgur.com/lhWRxlO.jpg",
"وجبة زنجر":"https://i.imgur.com/wgjBv86.jpg",
"وجبة برجر":"https://i.imgur.com/9S1VGKX.jpg",
"وجبة سكالوب":"https://i.imgur.com/CEdT5cx.jpg",
"صاروخ الشاورما":"https://i.imgur.com/KpajIR8.jpg"
}

/* ======================= */

const ORDERS = {}
let DELIVERY = []

/* ======================= */
/* SEND MESSAGE */
/* ======================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
})

}

/* ======================= */
/* SEND IMAGE */
/* ======================= */

async function sendImage(chatId,url,caption){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendFileByUrl/${GREEN_TOKEN}`,
{
chatId,
urlFile:url,
fileName:"menu.jpg",
caption
})

}

/* ======================= */
/* LOAD DELIVERY */
/* ======================= */

async function loadDelivery(){

if(DELIVERY.length>0) return

const res = await axios.get(DELIVERY_SHEET_URL)

DELIVERY = await csv().fromString(res.data)

}

/* ======================= */
/* ORDER */
/* ======================= */

function getOrder(user){

if(!ORDERS[user]){

ORDERS[user]={items:[],area:null,delivery:0}

}

return ORDERS[user]

}

/* ======================= */

function addItem(order,name,qty){

order.items.push({name,qty,price:MENU[name]})

}

/* ======================= */

function total(order){

let t=0

order.items.forEach(i=>{
t+=i.price*i.qty
})

t+=order.delivery

return t

}

/* ======================= */
/* AI */
/* ======================= */

async function extractOrder(text){

try{

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Extract order JSON

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

/* ======================= */
/* WEBHOOK */
/* ======================= */

app.post("/webhook", async (req,res)=>{

console.log("NEW MESSAGE")
console.log(JSON.stringify(req.body,null,2))

res.sendStatus(200)

try{

const chatId = req.body.senderData?.chatId

if(!chatId) return

if(chatId.endsWith("@g.us")) return

const message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""

const order = getOrder(chatId)

await loadDelivery()

/* ======================= */
/* MENU REQUEST */
/* ======================= */

if(message.includes("منيو")){

for(const item in MENU_IMAGES){

await sendImage(chatId,MENU_IMAGES[item],item)

}

return

}

/* ======================= */
/* AREA */
/* ======================= */

for(const row of DELIVERY){

if(message.includes(row.area)){

order.area=row.area
order.delivery=Number(row.price)

await send(chatId,"تم تحديد التوصيل "+row.area)

return

}

}

/* ======================= */
/* ORDER */
/* ======================= */

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

await send(chatId,"تم إضافة الطلب")

await send(chatId,"المجموع: "+total(order)+" دينار")

return

}

/* ======================= */

await send(chatId,"مرحبا 👋 اكتب منيو لرؤية الوجبات")

}catch(e){

console.log("ERROR",e.message)

}

})

/* ======================= */
/* ROOT */
/* ======================= */

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})

/* ======================= */

app.listen(PORT,()=>{

console.log("BOT STARTED")

})
