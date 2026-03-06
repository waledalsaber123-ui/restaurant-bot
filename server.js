import express from "express"

import {CONFIG} from "./config.js"

import {sendMessage} from "./whatsapp.js"

import {runAI} from "./ai.js"

import {createOrder,ORDERS} from "./orders.js"

import {SESSIONS} from "./sessions.js"

import {loadDelivery,getDeliveryPrice} from "./delivery.js"

const app=express()

app.use(express.json())

await loadDelivery()

function buildSummary(order){

const items=order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

return `

🧾 ملخص الطلب

${items}

📍 العنوان
${order.address}

🚚 التوصيل
${order.delivery}

💰 المجموع
${order.total}

اكتب "تأكيد الطلب" لتثبيت الطلب

`

}

function buildGroupMessage(order){

const items=order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

return `

🚨 طلب جديد

📞 الهاتف
${order.phone}

📍 العنوان
${order.address}

🍔 الطلب
${items}

🚚 التوصيل
${order.delivery}

💰 المجموع
${order.total}

#${order.id}

`

}

app.post("/webhook",async(req,res)=>{

const body=req.body

const chatId=body.senderData?.chatId

const text=body.messageData?.textMessageData?.textMessage

if(!chatId) return res.sendStatus(200)

if(chatId.includes("@g.us")) return res.sendStatus(200)

if(!SESSIONS[chatId]){

const order=createOrder(chatId)

SESSIONS[chatId]={orderId:order.id}

}

const order=ORDERS[SESSIONS[chatId].orderId]

const ai=await runAI(text)

if(ai.reply){

await sendMessage(chatId,ai.reply)

}

if(ai.intent==="order"){

ai.items.forEach(i=>{

order.items.push(i)

})

}

if(ai.intent==="address"){

order.address=text

order.delivery=getDeliveryPrice(text)

order.total=order.items.length+order.delivery

const summary=buildSummary(order)

await sendMessage(chatId,summary)

}

if(ai.intent==="confirm"){

const msg=buildGroupMessage(order)

await sendMessage(CONFIG.GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

}

res.sendStatus(200)

})

app.listen(CONFIG.PORT,()=>{

console.log("BOT RUNNING")

})
