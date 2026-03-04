import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const OPENAI_KEY = process.env.OPENAI_KEY;
const GREEN_TOKEN = process.env.GREEN_TOKEN;
const ID_INSTANCE = process.env.ID_INSTANCE;
const MENU_SHEET_URL = process.env.MENU_SHEET_URL;
const DELIVERY_SHEET_URL = process.env.DELIVERY_SHEET_URL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;

/* ========================= */
/* ORDER MEMORY */
/* ========================= */

const ORDERS = {};

function getOrder(user) {

if (!ORDERS[user]) {

ORDERS[user] = {
items: [],
step: "start",
area: null,
deliveryPrice: 0,
name: null,
phone: null
};

}

return ORDERS[user];

}

/* ========================= */
/* CACHE SYSTEM */
/* ========================= */

let MENU = [];
let DELIVERY = [];

async function loadData() {

if (MENU.length === 0) {

const res = await axios.get(MENU_SHEET_URL);
MENU = await csv().fromString(res.data);

}

if (DELIVERY.length === 0) {

const res = await axios.get(DELIVERY_SHEET_URL);
DELIVERY = await csv().fromString(res.data);

}

}

/* ========================= */
/* TEXT NORMALIZE */
/* ========================= */

function normalize(text) {

return text
.toLowerCase()
.replace(/أ|إ|آ/g, "ا")
.replace(/ة/g, "ه")
.replace(/ى/g, "ي");

}

/* ========================= */
/* SMART MENU MATCH */
/* ========================= */

function findMenuItem(text){

const clean = normalize(text)

for(const item of MENU){

const name = normalize(item.Name)

if(clean.includes(name) || name.includes(clean)){
return item
}

const words = name.split(" ")

for(const w of words){

if(clean.includes(w) && w.length > 3){
return item
}

}

}

return null

}

/* ========================= */
/* AREA MATCH */
/* ========================= */

function findArea(text){

const clean = normalize(text)

for(const row of DELIVERY){

const area = normalize(row.area)

if(clean.includes(area)){
return row
}

}

return null

}

/* ========================= */
/* SEND MESSAGE */
/* ========================= */

async function send(chatId,message){

await axios.post(
`https://7103.api.greenapi.com/waInstance${ID_INSTANCE}/sendMessage/${GREEN_TOKEN}`,
{
chatId,
message
}
)

}

/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook", async (req,res)=>{

res.sendStatus(200)

try{

if(req.body.typeWebhook !== "incomingMessageReceived") return

const message =
req.body.messageData?.extendedTextMessageData?.text ||
req.body.messageData?.textMessageData?.textMessage

let chatId = req.body.senderData?.chatId

if(!chatId) return
if(chatId.includes("@g.us")) return

await loadData()

const order = getOrder(chatId)

const text = normalize(message)

/* ========================= */
/* FIND MENU ITEM */
/* ========================= */

const item = findMenuItem(text)

/* ========================= */
/* ADD ITEM */
/* ========================= */

if(item){

order.items.push({
name:item.Name,
price:Number(item.Price)
})

order.step="confirm"

await send(chatId,
`👌 تم إضافة ${item.Name}

السعر ${item.Price} دينار

كم حبة بدك؟`
)

return

}

/* ========================= */
/* QUANTITY */
/* ========================= */

if(order.step==="confirm" && !isNaN(text)){

const qty = Number(text)

const last = order.items[order.items.length-1]

last.qty = qty

last.total = qty * last.price

await send(chatId,
`👍 تمام

${last.name} × ${qty}

بدك تضيف شي ثاني ولا بس هيك؟`
)

return

}

/* ========================= */
/* FINISH ITEMS */
/* ========================= */

if(order.step==="confirm" && (
text.includes("بس") ||
text.includes("خلص") ||
text.includes("تمام")
)){

order.step="delivery"

await send(chatId,
"الطلب توصيل ولا استلام من المطعم؟"
)

return

}

/* ========================= */
/* DELIVERY */
/* ========================= */

if(order.step==="delivery" && text.includes("توصيل")){

order.step="area"

await send(chatId,
"لوين التوصيل يا غالي؟"
)

return

}

/* ========================= */
/* AREA */
/* ========================= */

if(order.step==="area"){

const area = findArea(message)

if(area){

order.area = area.area
order.deliveryPrice = Number(area.price)

order.step="customer"

await send(chatId,
`🚚 التوصيل إلى ${area.area}

السعر ${area.price} دينار

أرسل اسمك ورقم الهاتف`
)

return

}

}

/* ========================= */
/* CUSTOMER INFO */
/* ========================= */

if(order.step==="customer"){

const parts = message.split(" ")

order.name = parts[0]
order.phone = parts[1]

const itemsTotal =
order.items.reduce((a,b)=>a+(b.total || b.price),0)

const total =
itemsTotal + order.deliveryPrice

await send(chatId,
`أبشر 👌

ملخص الطلب:

${order.items.map(i=>`🍔 ${i.name} × ${i.qty || 1}`).join("\n")}

🚚 ${order.area}

💰 المجموع ${total} دينار

هل نثبت الطلب؟`
)

order.step="confirm_final"

return

}

/* ========================= */
/* AI RESPONSE */
/* ========================= */

const ai = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:SYSTEM_PROMPT
},
{
role:"user",
content:message
}
]
},
{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
}
)

const reply = ai.data.choices[0].message.content

await send(chatId,reply)

}catch(e){

console.log("ERROR",e.message)

}

})

app.listen(PORT,()=>{
console.log("Restaurant Bot Running 🚀")
})
