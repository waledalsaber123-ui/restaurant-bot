import express from "express"

import {CONFIG} from "./config.js"

import {queue} from "./queue.js"

import {sendMessage} from "./whatsapp.js"

import {getSession} from "./sessions.js"

import {createOrder,getOrder} from "./orders.js"

import {parseMessage} from "./ai.js"

import {loadDelivery} from "./delivery.js"

const app=express()

app.use(express.json())

await loadDelivery()

function buildOrderMessage(order){

const items=order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

return `

طلب جديد 🍔

العميل:
${order.phone}

الطلب:
${items}

العنوان:
${order.address}

مدة التوصيل: ${CONFIG.DELIVERY_TIME} دقيقة

#${order.id}

`

}

app.post("/webhook",(req,res)=>{

queue.add(()=>handleMessage(req.body))

res.sendStatus(200)

})

async function handleMessage(body){

const chatId=body.senderData?.chatId

const text=body.messageData?.textMessageData?.textMessage

if(!chatId) return

if(chatId.includes("@g.us")) return

const session=getSession(chatId)

if(!session.orderId){

const order=createOrder(chatId)

session.orderId=order.id

}

const order=getOrder(session.orderId)

if(!text){

await sendMessage(chatId,"اكتب طلبك او كلمة عروض")

return

}

const ai=await parseMessage(text)

/* OFFERS */

if(ai.intent==="offers"){

await sendMessage(chatId,ai.reply)

return

}

/* ORDER */

if(ai.intent==="order"){

ai.items.forEach(i=>{

order.items.push(i)

})

await sendMessage(

chatId,

"تم إضافة الطلب 👍\nاكتب تأكيد الطلب لإرساله للمطعم"

)

}

/* CONFIRM */

if(ai.intent==="confirm"){

order.status="confirmed"

const msg=buildOrderMessage(order)

await sendMessage(CONFIG.GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

}

}

app.listen(CONFIG.PORT,()=>{

console.log("BOT RUNNING")

})
