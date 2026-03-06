import express from "express"

import {CONFIG} from "./config.js"

import {queue} from "./queue.js"

import {sendMessage} from "./whatsapp.js"

import {getSession,saveSession} from "./sessions.js"

import {createOrder,getOrder,saveOrder} from "./orders.js"

import {loadMenu,getMenu} from "./menu.js"

import {loadDelivery} from "./delivery.js"

import {parseMessage} from "./ai.js"

const app=express()

app.use(express.json())

await loadMenu()
await loadDelivery()

function buildOrderMessage(order){

const items=order.items
.map(i=>`${i.name} × ${i.qty}`)
.join("\n")

return `

طلب جديد 🍔

الهاتف: ${order.phone}

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

const session=await getSession(chatId)

if(!session.orderId){

const order=await createOrder(chatId)

session.orderId=order.id

await saveSession(chatId,session)

}

const order=await getOrder(session.orderId)

if(!text){

await sendMessage(chatId,"اكتب طلبك او كلمة عروض")
return

}

const ai=await parseMessage(text,getMenu())

if(ai.intent==="offers"){

const menu=getMenu()

const offers=Object.entries(menu)
.filter(([k,v])=>v.category==="offer")

const msg=offers
.map(([name,data])=>`🔥 ${name} - ${data.price}`)
.join("\n")

await sendMessage(chatId,`عروض اليوم:\n\n${msg}`)

return

}

if(ai.intent==="order"){

ai.items.forEach(i=>{
order.items.push(i)
})

await saveOrder(order)

await sendMessage(
chatId,
"تم إضافة الطلب 👍\nاكتب تأكيد الطلب لإرساله للمطعم"
)

}

if(ai.intent==="confirm" || text.includes("تأكيد")){

order.status="confirmed"

await saveOrder(order)

const msg=buildOrderMessage(order)

await sendMessage(CONFIG.GROUP_ID,msg)

await sendMessage(chatId,"تم تأكيد الطلب ✅")

}

}

app.listen(CONFIG.PORT,()=>{

console.log("BOT RUNNING")

})
