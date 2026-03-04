import express from "express"
import axios from "axios"

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

const OPENAI_KEY = process.env.OPENAI_KEY
const GREEN_TOKEN = process.env.GREEN_TOKEN
const ID_INSTANCE = process.env.ID_INSTANCE
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT

const MEMORY = {}
const MEMORY_LIMIT = 30

/* ======================= */
/* MEMORY */
/* ======================= */

function addMemory(user,role,content){

if(!MEMORY[user]) MEMORY[user] = []

MEMORY[user].push({
role,
content
})

if(MEMORY[user].length > MEMORY_LIMIT){
MEMORY[user].shift()
}

}

/* ======================= */
/* SEND WHATSAPP */
/* ======================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

addMemory(chatId,"assistant",message)

}

/* ======================= */
/* AI */
/* ======================= */

async function askAI(chatId,userText,imageUrl){

let userContent = userText

if(imageUrl){

userContent = [
{
type:"text",
text:userText || "العميل أرسل صورة"
},
{
type:"image_url",
image_url:{url:imageUrl}
}
]

}

const response = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:SYSTEM_PROMPT
},
...(MEMORY[chatId] || []),
{
role:"user",
content:userContent
}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

return response.data.choices[0].message.content

}

/* ======================= */
/* WEBHOOK */
/* ======================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

let chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.includes("@g.us")) return

const textMessage =
req.body.messageData?.extendedTextMessageData?.text ||
req.body.messageData?.textMessageData?.textMessage ||
""

const imageUrl =
req.body.messageData?.imageMessageData?.downloadUrl ||
null

addMemory(chatId,"user",textMessage || "image")

const aiReply = await askAI(chatId,textMessage,imageUrl)

await send(chatId,aiReply)

}catch(e){

console.log("BOT ERROR:",e.response?.data || e.message)

}

})

/* ======================= */
/* ROOT */
/* ======================= */

app.get("/",(req,res)=>{

res.send("Restaurant AI Bot Running 🚀")

})

/* ======================= */
/* START */
/* ======================= */

app.listen(PORT,()=>{

console.log(`🚀 Bot Running on port ${PORT}`)

})
