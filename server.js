import express from "express"
import axios from "axios"
import csv from "csvtojson"

const app = express()
app.use(express.json())
console.log("USER MESSAGE:",message)
const PORT = process.env.PORT || 3000

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL

const ORDER_GROUP_ID = "120363407952234395@g.us"

/* ========================= */
/* MENU (من البرونت) */
/* ========================= */

const MENU = {
"خابور كباب":2,
"الوجبة العملاقة سناكات":3,
"الوجبة العائلية سناكات":5,
"الوجبة الاقتصادية سناكات":2,
"وجبة زنجر عادي":2,
"قمبلة رمضان برجر":2.25,
"الوجبة الاقتصادية شورما":2,
"صاروخ الشاورما":1.5,
"زنجر ديناميت العرض":2,
"الشاورما العائلية الاوفر":5,
"وجبة برجر لحمة 150 غم":2,
"وجبة سكالوب":2,
"وجبات الشورما الفردية":1.5
}

/* ========================= */
/* الصور */
/* ========================= */

const IMAGES = {

"خابور كباب":"https://i.imgur.com/lhWRxlO.jpg",
"الوجبة العملاقة سناكات":"https://i.imgur.com/YBdJtXk.jpg",
"الوجبة العائلية سناكات":"https://i.imgur.com/6uzbeo4.jpg",
"الوجبة الاقتصادية سناكات":"https://i.imgur.com/pvBkKto.jpg",
"وجبة زنجر عادي":"https://i.imgur.com/wgjBv86.jpg",
"قمبلة رمضان برجر":"https://i.imgur.com/NrPMh4h.jpg",
"الوجبة الاقتصادية شورما":"https://i.imgur.com/rmq4PS0.jpg",
"صاروخ الشاورما":"https://i.imgur.com/KpajIR8.jpg",
"زنجر ديناميت العرض":"https://i.imgur.com/sZhwxXE.jpg",
"الشاورما العائلية الاوفر":"https://i.imgur.com/tZedL2M.jpg",
"وجبة برجر لحمة 150 غم":"https://i.imgur.com/9S1VGKX.jpg",
"وجبة سكالوب":"https://i.imgur.com/CEdT5cx.jpg",
"وجبات الشورما الفردية":"https://i.imgur.com/FaZvkHe.jpg"

}

/* ========================= */

const ORDERS={}
let DELIVERY=[]

/* ========================= */
/* تحميل التوصيل */
/* ========================= */

async function loadDelivery(){

if(DELIVERY.length>0) return

const res=await axios.get(DELIVERY_SHEET_URL)

DELIVERY=await csv().fromString(res.data)

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

ORDERS[user]={

items:[],
area:null,
delivery:0,
confirmed:false

}

}

return ORDERS[user]

}

/* ========================= */

function addItem(order,name,qty=1){

const existing=order.items.find(i=>i.name===name)

if(existing){

existing.qty+=qty

}else{

order.items.push({
name,
qty,
price:MENU[name]
})

}

}

/* ========================= */

function total(order){

let t=0

order.items.forEach(i=>{
t+=i.qty*i.price
})

t+=order.delivery

return t

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
/* AI فهم الطلب */
/* ========================= */

async function extractOrder(text){

try{

const ai=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Extract restaurant order JSON.

Return format:

{
items:[
{name:"item",qty:number}
]
}

Menu:
${Object.keys(MENU).join(",")}`
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
/* AI للحوار */
/* ========================= */

async function aiChat(text){

const ai=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`انت موظف مبيعات في مطعم.

كن مهذب وودود.
اقترح وجبات من القائمة فقط.
لا تذكر اسعار.`
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

return ai.data.choices[0].message.content

}

/* ========================= */
/* تحليل صورة إعلان */
/* ========================= */

async function analyzeImage(url){

const ai=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Identify the food item from menu.

Menu:
${Object.keys(MENU).join(",")}

Return name only`
},
{
role:"user",
content:[
{type:"text",text:"what food is this"},
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
/* WEBHOOK */
/* ========================= */

app.post("/webhook",async(req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook!=="incomingMessageReceived") return

const chatId=req.body.senderData?.chatId

if(!chatId) return

/* عدم الرد على الجروبات */

if(chatId.endsWith("@g.us")) return

let message=
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""

let imageUrl=null

if(req.body.messageData?.fileMessageData){

imageUrl=req.body.messageData.fileMessageData.downloadUrl

}

const order=getOrder(chatId)

await loadDelivery()

/* ========================= */
/* صورة */
/* ========================= */

if(imageUrl){

const item=await analyzeImage(imageUrl)

if(MENU[item]){

addItem(order,item)

await sendImage(chatId,IMAGES[item],item)

await send(chatId,"تم إضافة الصنف 👍")

}

return

}

/* ========================= */
/* منطقة */
/* ========================= */

for(const row of DELIVERY){

if(normalize(message).includes(normalize(row.area))){

order.area=row.area
order.delivery=Number(row.price)

await send(chatId,`🚚 التوصيل الى ${row.area}`)

return

}

}

/* ========================= */
/* فهم الطلب */
/* ========================= */

const result=await extractOrder(message)

if(result && result.items){

for(const item of result.items){

if(MENU[item.name]){

addItem(order,item.name,item.qty||1)

await sendImage(chatId,IMAGES[item.name],item.name)

}

}

await send(chatId,`تم إضافة الطلب 👍

المجموع الحالي ${total(order)} دينار`)

return

}

/* ========================= */
/* تأكيد */
/* ========================= */

if(normalize(message).includes("تأكيد")){

let itemsText=""

order.items.forEach(i=>{
itemsText+=`• ${i.name} × ${i.qty}\n`
})

const text=`

🆕 طلب جديد

🍔 الطلب
${itemsText}

🚚 ${order.area}

💰 المجموع ${total(order)} دينار
`

await send(ORDER_GROUP_ID,text)

await send(chatId,"تم تأكيد الطلب 👍")

return

}

/* ========================= */
/* AI حوار */
/* ========================= */

const reply=await aiChat(message)

await send(chatId,reply)

}catch(e){

console.log("BOT ERROR",e.response?.data || e.message)

}

})

/* ========================= */

app.get("/",(req,res)=>{
res.send("Restaurant Bot Running")
})

app.listen(PORT,()=>{
console.log("BOT RUNNING")
})
