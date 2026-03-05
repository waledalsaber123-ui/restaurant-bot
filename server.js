import express from "express"
import axios from "axios"
import csv from "csvtojson"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL

const ORDER_GROUP = "120363407952234395@g.us"


/* ========================= */
/* MENU FROM FRONTEND */
/* ========================= */

const MENU = {

"خابور كباب":2,
"الوجبة العملاقة سناكات":3,
"الوجبة العائلية سناكات":5,
"الوجبة الاقتصادية سناكات":2,

"وجبة زنجر عادي":2,
"قمبلة رمضان برجر":2.25,
"الوجبة الاقتصادية شورما":2,
"ضاروخ الشاورما":1.5,

"ونجر ديناميت العرض":2,
"شاورما العائلية الاوفر":5,

"وجبة برجر لحمة 150 غم":2,
"وجبة سكالوب":2,

"وجبات الشورما الفردية":1.5

}


/* ========================= */
/* MENU IMAGES */
/* ========================= */

const MENU_IMAGES = {

"خابور كباب":"https://i.imgur.com/lhWRxlO.jpg",

"الوجبة العملاقة سناكات":"https://i.imgur.com/YBdJtXk.jpg",

"الوجبة العائلية سناكات":"https://i.imgur.com/6uzbeo4.jpg",

"الوجبة الاقتصادية سناكات":"https://i.imgur.com/pvBkKto.jpg",

"وجبة زنجر عادي":"https://i.imgur.com/wgjBv86.jpg",

"قمبلة رمضان برجر":"https://i.imgur.com/NrPMh4h.jpg",

"الوجبة الاقتصادية شورما":"https://i.imgur.com/rmq4PS0.jpg",

"ضاروخ الشاورما":"https://i.imgur.com/KpajIR8.jpg",

"ونجر ديناميت العرض":"https://i.imgur.com/sZhwxXE.jpg",

"شاورما العائلية الاوفر":"https://i.imgur.com/tZedL2M.jpg",

"وجبة برجر لحمة 150 غم":"https://i.imgur.com/9S1VGKX.jpg",

"وجبة سكالوب":"https://i.imgur.com/CEdT5cx.jpg",

"وجبات الشورما الفردية":"https://i.imgur.com/FaZvkHe.jpg"

}


/* ========================= */

const ORDERS = {}
let DELIVERY = []


/* ========================= */
/* LOAD DELIVERY */
/* ========================= */

async function loadDelivery(){

if(DELIVERY.length>0) return

const res = await axios.get(DELIVERY_SHEET_URL)

DELIVERY = await csv().fromString(res.data)

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


/* ========================= */

function getOrder(user){

if(!ORDERS[user]){

ORDERS[user]={
items:[],
area:null,
delivery:0,
confirmed:false
}

}

return ORDERS[user]

}


function addItem(order,name){

order.items.push({
name,
price:MENU[name]
})

}


function total(order){

let t = 0

order.items.forEach(i=>{
t += i.price
})

t += order.delivery

return t

}


/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

const chatId = req.body.senderData?.chatId

if(!chatId) return

/* منع الرد على الجروبات */

if(chatId.endsWith("@g.us")) return


const message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""


const order = getOrder(chatId)

await loadDelivery()


/* ========================= */
/* MENU REQUEST */
/* ========================= */

if(message.includes("منيو")){

for(const item in MENU_IMAGES){

await sendImage(chatId,MENU_IMAGES[item],item)

}

return

}


/* ========================= */
/* AREA */
/* ========================= */

for(const row of DELIVERY){

if(message.includes(row.area)){

order.area = row.area
order.delivery = Number(row.price)

await send(chatId,"🚚 التوصيل الى "+row.area+" = "+row.price+" دينار")

return

}

}


/* ========================= */
/* ADD ITEM */
/* ========================= */

for(const item in MENU){

if(message.includes(item)){

addItem(order,item)

if(MENU_IMAGES[item]){

await sendImage(chatId,MENU_IMAGES[item],item)

}

await send(chatId,"تم إضافة "+item)

await send(chatId,"💰 المجموع الحالي "+total(order)+" دينار")

return

}

}


/* ========================= */
/* CONFIRM ORDER */
/* ========================= */

if(message.includes("تأكيد")){

order.confirmed = true

let text = "طلب جديد\n\n"

order.items.forEach(i=>{
text += i.name+"\n"
})

text += "\nالتوصيل: "+order.area
text += "\nالمجموع: "+total(order)+" دينار"

await send(ORDER_GROUP,text)

await send(chatId,"تم تأكيد الطلب 👍")

return

}


/* ========================= */

await send(chatId,"مرحبا 👋 اكتب منيو لرؤية الوجبات")

}catch(e){

console.log("ERROR:",e.message)

}

})


/* ========================= */

app.get("/",(req,res)=>{
res.send("Restaurant Bot Running")
})


app.listen(PORT,()=>{
console.log("BOT RUNNING")
})
