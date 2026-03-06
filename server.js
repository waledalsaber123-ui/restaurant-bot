import express from "express"

import {CONFIG} from "./config.js"
import {queue} from "./queue.js"

import {sendMessage} from "./whatsapp.js"

import {getSession} from "./sessions.js"
import {createOrder,getOrder} from "./orders.js"

import {parseMessage} from "./ai.js"

const app = express()

app.use(express.json())

/* ========================= */

function buildOrderMessage(order){

 const items = order.items
  .map(i => `${i.name} × ${i.qty}`)
  .join("\n")

 return `

🧾 طلب جديد

👤 العميل:
${order.phone}

🍔 الطلب:
${items}

📍 العنوان:
${order.address || "غير محدد"}

⏱ مدة التوصيل: ${CONFIG.DELIVERY_TIME} دقيقة

#${order.id}

`
}

/* ========================= */

app.post("/webhook",(req,res)=>{

 queue.add(()=>handleMessage(req.body))

 res.sendStatus(200)

})

/* ========================= */

async function handleMessage(body){

 const chatId = body.senderData?.chatId
 const text = body.messageData?.textMessageData?.textMessage

 if(!chatId) return

 /* ignore groups */

 if(chatId.includes("@g.us")) return

 const msg = text?.toLowerCase() || ""

 /* ========================= */
 /* HELLO MESSAGE */

 if(
  msg.includes("مرحبا") ||
  msg.includes("هلا") ||
  msg.includes("السلام")
 ){

  await sendMessage(chatId,`

أهلاً وسهلاً يا غالي 👋

🔥 في عنا عروض قوية اليوم:

1️⃣ ديناميت 45 سم — 1 دينار  
2️⃣ صاروخ الشاورما — 1.5 دينار  
3️⃣ قنبلة رمضان — 2.25 دينار  
4️⃣ خابور كباب — 2 دينار  

شو بتحب نجهزلك؟ 🍔

`)

  return
 }

 /* ========================= */
 /* MENU QUESTION */

 if(
  msg.includes("اصناف") ||
  msg.includes("المنيو") ||
  msg.includes("شو عندك") ||
  msg.includes("شو في") ||
  msg.includes("ايش عندك")
 ){

  await sendMessage(chatId,`

🔥 أهم العروض عندنا:

1️⃣ ديناميت 45 سم — 1 دينار  
2️⃣ صاروخ الشاورما — 1.5 دينار  
3️⃣ قنبلة رمضان — 2.25 دينار  
4️⃣ خابور كباب — 2 دينار  

إذا بدك وجبة عائلية أو شاورما أو برجر خبرني يا غالي 👌

`)

  return
 }

 /* ========================= */

 const session = getSession(chatId)

 if(!session.orderId){

  const order = createOrder(chatId)

  session.orderId = order.id
 }

 const order = getOrder(session.orderId)

 if(!text){

  await sendMessage(chatId,"اكتب طلبك يا غالي 👌")
  return
 }

 /* ========================= */
 /* AI ORDER PARSER */

 const ai = await parseMessage(text)

 /* ========================= */
 /* OFFERS */

 if(ai.intent === "offers"){

  await sendMessage(chatId,`

🔥 في عنا عروض قوية اليوم:

ديناميت 45 سم — 1 دينار  
صاروخ الشاورما — 1.5 دينار  
قنبلة رمضان — 2.25 دينار  
خابور كباب — 2 دينار  

شو بتحب نجربلك منهم يا غالي؟

`)

  return
 }

 /* ========================= */
 /* ADD ORDER */

 if(ai.intent === "order"){

  ai.items.forEach(i=>{
   order.items.push(i)
  })

  await sendMessage(

   chatId,

`تمام 👌

تم إضافة الطلب.

بدك تضيف شي ثاني
ولا نثبت الطلب؟`

  )

 }

 /* ========================= */
 /* CONFIRM ORDER */

 if(ai.intent === "confirm"){

  order.status = "confirmed"

  const msg = buildOrderMessage(order)

  await sendMessage(CONFIG.GROUP_ID,msg)

  await sendMessage(

   chatId,

`تم تثبيت الطلب ✅

رح يتم تجهيز الطلب خلال ${CONFIG.DELIVERY_TIME} دقيقة.

يعطيك العافية يا غالي 🙏`

  )

 }

}

/* ========================= */

app.listen(CONFIG.PORT,()=>{

 console.log("BOT RUNNING")

})
