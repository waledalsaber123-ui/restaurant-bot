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

/* ================= */

const MENU = JSON.parse(fs.readFileSync("./menu.json"))
const IMAGES = JSON.parse(fs.readFileSync("./images.json"))
const OFFERS = JSON.parse(fs.readFileSync("./offers.json"))
const MESSAGES = JSON.parse(fs.readFileSync("./messages.json"))

/* ================= */

let DELIVERY=[]
const ORDERS={}

/* ================= */

function normalize(text){

return text
.toLowerCase()
.replace(/أ|إ|آ/g,"ا")
.replace(/ة/g,"ه")
.replace(/ى/g,"ي")

}

/* ================= */

function findItem(text){

const clean = normalize(text)

for(const item in MENU){

if(clean.includes(normalize(item))){

return item

}

}

return null

}

/* ================= */

function suggest(){

return OFFERS[Math.floor(Math.random()*OFFERS.length)]

}

/* ================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{chatId,message}
)

}

/* ================= */

async function sendImage(chatId,url,caption){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendFileByUrl/${GREEN_TOKEN}`,
{
chatId,
urlFile:url,
fileName:"menu.jpg",
caption
}
)

}

/* ================= */
/* تحليل صورة إعلان */
/* ================= */

async function analyzeImage(url){

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`Identify the food item from this menu only.

Menu:
${Object.keys(MENU).join(",")}

Return only the item name`
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

/* ================= */

app.post("/webhook",async(req,res)=>{

res.sendStatus(200)

try{

const chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.endsWith("@g.us")) return

let message =
req.body.messageData?.textMessageData?.textMessage ||
req.body.messageData?.extendedTextMessageData?.text ||
""

/* صورة */

let imageUrl = null

if(req.body.messageData?.fileMessageData){

imageUrl = req.body.messageData.fileMessageData.downloadUrl

}

/* ================= */
/* فهم صورة اعلان */
/* ================= */

if(imageUrl){

const item = await analyzeImage(imageUrl)

if(IMAGES[item]){

await sendImage(chatId,IMAGES[item],item)

await send(chatId,"هل ترغب بطلب هذا الصنف؟")

}

return

}

/* ================= */

const item = findItem(message)

if(item){

await sendImage(chatId,IMAGES[item],item)

await send(chatId,

`تم اختيار ${item} 👍

${MESSAGES.upsell}`)

return

}

/* ================= */

if(message.includes("منيو")){

for(const item in IMAGES){

await sendImage(chatId,IMAGES[item],item)

}

return

}

/* ================= */

await send(chatId,

`${MESSAGES.welcome}

${suggest()}

${MESSAGES.ask}`)

}catch(e){

console.log(e)

}

})

app.get("/",(req,res)=>{
res.send("Restaurant Bot Running")
})

app.listen(PORT,()=>{
console.log("BOT RUNNING")
})
