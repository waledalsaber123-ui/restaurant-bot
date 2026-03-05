رimport express from "express"
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
/* OFFERS */
/* ========================= */

const OFFERS = [
"🔥 عرض اليوم: خابور كباب",
"🔥 زنجر ديناميت من أكثر الطلبات",
"🔥 جرب صاروخ الشاورما مع طلبك",
"🔥 الشاورما العائلية تكفي 4 أشخاص"
]

/* ========================= */

const ORDERS={}
let DELIVERY=[]

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
delivery:0
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

function randomOffer(){
return OFFERS[Math.floor(Math.random()*OFFERS.length)]
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
headers:{Authorization:`Bearer ${OPENAI_KEY}`}
}
)

return JSON.parse(ai.data.choices[0].message.content)

}catch{
return null
}

}

/* ========================= */
/* AI الحوار */
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

هدفك زيادة الطلب.

دائماً:
- اقترح وجبات
- ركز على العروض
- حاول بيع صنف إضافي

لا تخترع اسعار.`
},
{
role:"user",
content:text
}
]
},
{
headers:{Authorization:`Bearer ${OPENAI_KEY}`}
}
)

return ai.data.choices[0].message.content

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

if(chatId.endsWith("@g.us")) return

let message=
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""

console.log("USER:",message)

const order=getOrder(chatId)

await loadDelivery()

/* ========================= */
/* عروض */
/* ========================= */

if(normalize(message).includes("عرض")){

await send(chatId,
`🔥 عروض اليوم:

${OFFERS.join("\n")}

أي عرض تحب؟`)

return

}

/* ========================= */
/* الطلب */
/* ========================= */

const result=await extractOrder(message)

if(result && result.items){

for(const item of result.items){

if(MENU[item.name]){

addItem(order,item.name,item.qty||1)

await sendImage(chatId,IMAGES[item.name],item.name)

}

}

await send(chatId,
`👍 تم إضافة الطلب

💰 المجموع الحالي ${total(order)} دينار

${randomOffer()}`)

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

await send(chatId,"تم إرسال الطلب للمطعم 👍")

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
