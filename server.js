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
/* MENU (SYSTEM ONLY) */
/* ========================= */

const MENU = {
"ديناميت":1,
"صاروخ الشاورما":1.5,
"قنبلة رمضان":2.25,
"خابور كباب":2,
"وجبة زنجر":2,
"وجبة سكالوب":2,
"وجبة برجر":2,
"وجبة شاورما":2
}

/* ========================= */

const ORDERS={}
const MEMORY={}
let DELIVERY=[]

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

function getMemory(user){

if(!MEMORY[user]){

MEMORY[user]={
history:[]
}

}

return MEMORY[user]

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

function addItem(order,name,qty=1){

const price=MENU[name]

order.items.push({
name,
qty,
price
})

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

async function loadDelivery(){

if(DELIVERY.length>0) return

const res=await axios.get(DELIVERY_SHEET_URL)
DELIVERY=await csv().fromString(res.data)

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
/* AI SALES CHAT */
/* ========================= */

async function aiChat(text,memory){

const prompt=`

انت موظف مبيعات في مطعم.

تكلم مع العميل بطريقة ودية.
كن طبيعي.
ساعده يختار طلب.
اقترح عليه اصناف.

لا تخترع اسعار.
لا تؤكد الطلب.

فقط تحدث مثل موظف مبيعات.

استخدم اسلوب اردني بسيط مثل:
يا غالي
ابشر
ولا يهمك

`

const ai=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{role:"system",content:prompt},
...memory.history,
{role:"user",content:text}
]
},
{
headers:{Authorization:`Bearer ${OPENAI_KEY}`}
}
)

return ai.data.choices[0].message.content

}

/* ========================= */
/* AI ORDER EXTRACTION */
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
content:`

Extract food item and quantity.

Return JSON:

{
item:"name",
qty:number
}

`
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

const order=getOrder(chatId)
const memory=getMemory(chatId)

memory.history.push({role:"user",content:message})

if(memory.history.length>6){
memory.history.shift()
}

await loadDelivery()

/* ========================= */
/* فهم الطلب */
/* ========================= */

const result=await extractOrder(message)

if(result && result.item){

const itemName=result.item

if(MENU[itemName]){

addItem(order,itemName,result.qty||1)

await send(chatId,
`👍 تم إضافة ${itemName}

💰 المجموع الحالي ${total(order)} دينار`)

return

}

}

/* ========================= */
/* منطقة */
/* ========================= */

for(const row of DELIVERY){

if(normalize(message).includes(normalize(row.area))){

order.area=row.area
order.delivery=Number(row.price)

await send(chatId,
`🚚 التوصيل الى ${row.area}

رسوم التوصيل ${row.price}`)

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

${itemsText}

📍 ${order.area}

💰 المجموع ${total(order)} دينار
`

await send(ORDER_GROUP_ID,text)

await send(chatId,"تم ارسال الطلب للمطعم 👍")

return

}

/* ========================= */
/* AI SALES */
/* ========================= */

const reply=await aiChat(message,memory)

memory.history.push({role:"assistant",content:reply})

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
