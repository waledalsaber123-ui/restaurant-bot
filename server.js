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

"وجبة زنجر":"https://raw.githubusercontent.com/username/menu-images/main/zinger.png",
"وجبة سكالوب":"https://raw.githubusercontent.com/username/menu-images/main/scallop.png",
"وجبة برجر":"https://raw.githubusercontent.com/username/menu-images/main/burger.png",
"بطاطا":"https://raw.githubusercontent.com/username/menu-images/main/fries.png"

}


/* ========================= */
/* MEMORY */
/* ========================= */

const ORDERS = {}
const CUSTOMERS = {}

let DELIVERY = []
let LAST_FETCH = 0


/* ========================= */
/* LOAD DELIVERY */
/* ========================= */

async function loadDelivery(){

const now = Date.now()

if(now - LAST_FETCH < 600000 && DELIVERY.length>0) return

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
deliveryPrice:0,
status:"draft",
cancelRequest:false

}

}

return ORDERS[user]

}


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

total += i.price * i.qty

})

total += order.deliveryPrice

return total

}


/* ========================= */

function orderSummary(order){

if(order.items.length===0) return "لا يوجد طلب بعد"

const items = order.items
.map(i=>`• ${i.name} × ${i.qty}`)
.join("\n")

const total = calculateTotal(order)

return `

🍔 طلبك الحالي

${items}

🚚 التوصيل: ${order.area || "لم يتم تحديد المنطقة"}

💵 المجموع: ${total} دينار
`

}


/* ========================= */
/* UPSSELL */
/* ========================= */

function upsell(order){

if(order.items.find(i=>i.name.includes("زنجر"))){

return "🔥 كثير ناس يضيفوا بطاطا مع الزنجر 🍟"

}

if(order.items.find(i=>i.name==="بطاطا")){

return "🍟 ممكن تكبرها لعائلي بفرق 2 دينار"

}

return "🔥 جرب تضيف ديناميت مع الطلب"

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
model:"gpt-4o",
messages:[
{
role:"system",
content:`Extract food order JSON.

Return:

{items:[{name:"",qty:1}]}

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

res.sendStatus(200)

try{

if(req.body.typeWebhook!=="incomingMessageReceived") return

const chatId=req.body.senderData?.chatId

if(!chatId) return


/* تجاهل الجروبات */

if(chatId.endsWith("@g.us")) return


/* تجاهل رسائل البوت */

if(req.body.senderData?.isSender) return


let message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""


const order=getOrder(chatId)
const customer=getCustomer(chatId)

await loadDelivery()


/* ========================= */
/* LOCK AFTER CONFIRM */
/* ========================= */

if(order.status==="confirmed"){

await send(chatId,

`طلبك قيد التحضير 👨‍🍳

لا يمكن تعديل الطلب بعد التأكيد

للتواصل مع المطعم:
📞 ${RESTAURANT_PHONE}`)

return

}


/* ========================= */
/* CANCEL REQUEST */
/* ========================= */

if(normalize(message).includes("الغاء")){

order.cancelRequest=true

await send(chatId,

`😢 هل أنت متأكد من الإلغاء؟

يمكننا تعديل الطلب بدل الإلغاء

اكتب:
تأكيد الالغاء`)

return

}


if(normalize(message).includes("تأكيد الالغاء")){

order.status="cancelled"

await send(ORDER_GROUP_ID,"❌ تم إلغاء الطلب")

await send(chatId,"تم إلغاء الطلب")

return

}


/* ========================= */
/* AREA */
/* ========================= */

for(const row of DELIVERY){

if(normalize(message).includes(normalize(row.area))){

order.area=row.area
order.deliveryPrice=Number(row.price)

await send(chatId,
`🚚 تم تحديد المنطقة

${orderSummary(order)}`)

return

}

}


/* ========================= */
/* ORDER */
/* ========================= */

const result=await extractOrder(message)

if(result && result.items){

let added=false

for(const item of result.items){

if(MENU[item.name]){

addItem(order,item.name,item.qty||1)

added=true

if(MENU_IMAGES[item.name]){

await sendImage(chatId,MENU_IMAGES[item.name],item.name)

}

}

}

if(added){

await send(chatId,

`${orderSummary(order)}

${upsell(order)}`)

}

return

}


/* ========================= */
/* PHONE */
/* ========================= */

const phoneMatch=message.match(/07\d{8}/)

if(phoneMatch){

customer.phone=phoneMatch[0]

customer.name=message.replace(phoneMatch[0],"").trim()

await send(chatId,"تم تسجيل الرقم 👍")

return

}


/* ========================= */
/* CONFIRM */
/* ========================= */

if(normalize(message).includes("تأكيد")){

if(!customer.phone){

await send(chatId,"أرسل الاسم + رقم الهاتف")

return

}

order.status="confirmed"

const items=order.items
.map(i=>`• ${i.name} × ${i.qty}`)
.join("\n")

const total=calculateTotal(order)

await send(ORDER_GROUP_ID,

`✅ طلب مؤكد

👤 ${customer.name}
📞 ${customer.phone}

🍔 الطلب
${items}

🚚 ${order.area}

💰 التوصيل ${order.deliveryPrice}
💵 المجموع ${total}`)

await send(chatId,"تم تأكيد الطلب 👍")

return

}

}catch(e){

console.log("BOT ERROR",e.message)

}

})


app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})


app.listen(PORT,()=>{

console.log("🚀 Bot Running")

})
