import express from "express"
import axios from "axios"
import fs from "fs"
import csv from "csvtojson"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL

const ORDER_GROUP = "120363407952234395@g.us"

const MENU = JSON.parse(fs.readFileSync("./menu.json"))
const IMAGES = JSON.parse(fs.readFileSync("./images.json"))
const OFFERS = JSON.parse(fs.readFileSync("./offers.json"))

let DELIVERY=[]
const ORDERS={}

/* ========================= */

async function loadDelivery(){

if(DELIVERY.length>0) return

const res = await axios.get(DELIVERY_SHEET_URL)
DELIVERY = await csv().fromString(res.data)

}

/* ========================= */

function normalize(text){

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

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{chatId,message}
)

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

function suggestOffer(){

return OFFERS[Math.floor(Math.random()*OFFERS.length)]

}

/* ========================= */
/* AI لفهم الطلب */
/* ========================= */

async function understandOrder(text){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`
Extract restaurant order JSON.

Return:

{
items:[
{name:"item",qty:number}
]
}

Menu:
${Object.keys(MENU).join(",")}
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

try{
return JSON.parse(ai.data.choices[0].message.content)
}catch{
return null
}
}

/* ========================= */
/* AI للحوار */
/* ========================= */

async function aiTalk(message){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`
انت موظف مبيعات في مطعم.

كن مهذب وودود.
اقترح وجبات من القائمة فقط.
لا تذكر اسعار.
`
},
{
role:"user",
content:message
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
/* تحليل صورة إعلان */
/* ========================= */

async function analyzeImage(url){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`
Identify food item from menu.

Menu:
${Object.keys(MENU).join(",")}

Return item name only.
`
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
headers:{Authorization:`Bearer ${OPENAI_KEY}`}
}
)

return ai.data.choices[0].message.content.trim()

}

/* ========================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook!=="incomingMessageReceived") return

const chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.endsWith("@g.us")) return

let message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""

let imageUrl = null

if(req.body.messageData?.fileMessageData){

imageUrl = req.body.messageData.fileMessageData.downloadUrl

}

const order = getOrder(chatId)

await loadDelivery()

/* ========================= */
/* صورة إعلان */
/* ========================= */

if(imageUrl){

const item = await analyzeImage(imageUrl)

if(IMAGES[item]){

await sendImage(chatId,IMAGES[item],item)

await send(chatId,"هل ترغب بطلب هذا الصنف؟")

}

return

}

/* ========================= */
/* فهم الطلب */
/* ========================= */

const result = await understandOrder(message)

if(result && result.items){

for(const item of result.items){

order.items.push(item.name)

if(IMAGES[item.name]){

await sendImage(chatId,IMAGES[item.name],item.name)

}

}

await send(chatId,
`تم إضافة الطلب 👍

${suggestOffer()}

هل ترغب بإضافة شيء آخر؟`)

return

}

/* ========================= */
/* منطقة التوصيل */
/* ========================= */

for(const row of DELIVERY){

if(normalize(message).includes(normalize(row.area))){

order.area=row.area
order.delivery=row.price

await send(chatId,
`🚚 التوصيل الى ${row.area}
السعر ${row.price} دينار`)

return

}

}

/* ========================= */
/* تأكيد الطلب */
/* ========================= */

if(normalize(message).includes("تأكيد")){

let text="🆕 طلب جديد\n\n"

order.items.forEach(i=>{
text+="• "+i+"\n"
})

text+=`\n🚚 ${order.area}`

await send(ORDER_GROUP,text)

await send(chatId,"تم إرسال الطلب للمطعم 👍")

return

}

/* ========================= */
/* حوار */
/* ========================= */

const reply = await aiTalk(message)

await send(chatId,reply)

}catch(e){

console.log("BOT ERROR",e.message)

}

})

app.get("/",(req,res)=>{

res.send("Restaurant Bot Running")

})

app.listen(PORT,()=>{

console.log("BOT RUNNING")

})
