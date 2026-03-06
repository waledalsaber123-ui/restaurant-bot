import express from "express";
import axios from "axios";
import csv from "csvtojson";

const app = express();
app.use(express.json());

const CONFIG = {
OPENAI_KEY: process.env.OPENAI_KEY,
GREEN_TOKEN: process.env.GREEN_TOKEN,
ID_INSTANCE: process.env.ID_INSTANCE,
ORDER_GROUP_ID: "120363407952234395@g.us",
DELIVERY_SHEET_URL: process.env.DELIVERY_SHEET_URL,
API_URL:`https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};

/* ========================= */
/* SESSION MEMORY */
/* ========================= */

const SESSIONS={};

/* ========================= */
/* MENU SYSTEM */
/* ========================= */

const MENU={
"خابور كباب":2,
"الوجبة العملاقة":3,
"صاروخ شاورما":1.5,
"زنجر ديناميت":2
};

/* ========================= */
/* DELIVERY */
/* ========================= */

async function getDeliveryPrice(area){

try{

const res=await axios.get(CONFIG.DELIVERY_SHEET_URL);
const data=await csv().fromString(res.data);

const zone=data.find(z=>area.includes(z.area.trim()));

return zone ? parseFloat(zone.price) : 0;

}catch{

return 0;

}

}

/* ========================= */
/* AI ENGINE */
/* ========================= */

async function askAI(userMsg,session){

const prompt=`

أنت موظف مبيعات لمطعم.

قواعدك:

- لا تكرر الترحيب.
- الترحيب يكون فقط إذا كانت أول رسالة.
- إذا سأل العميل عن الأصناف اعرض المنيو.
- إذا ذكر اسم وجبة أضفها مباشرة.

المنيو:
خابور كباب
صاروخ شاورما
زنجر ديناميت
الوجبة العملاقة

إذا أضفت صنف استخدم:

[ADD:اسم_الصنف:الكمية]

سلة العميل:
${JSON.stringify(session.items)}

`;

const res=await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model:"gpt-4o-mini",
messages:[
{role:"system",content:prompt},
...session.history,
{role:"user",content:userMsg}
],
temperature:0
},
{
headers:{Authorization:`Bearer ${CONFIG.OPENAI_KEY}`}
}
);

return res.data.choices[0].message.content;

}

/* ========================= */
/* ADD ITEM */
/* ========================= */

function addItem(session,name,qty){

const price=MENU[name];

if(!price) return;

const existing=session.items.find(i=>i.n===name);

if(existing){

existing.q+=qty;

}else{

session.items.push({
n:name,
p:price,
q:qty
});

}

}

/* ========================= */
/* WEBHOOK */
/* ========================= */

app.post("/webhook",async(req,res)=>{

res.sendStatus(200);

const body=req.body;

if(body.typeWebhook!=="incomingMessageReceived") return;

const chatId=body.senderData.chatId;

const userMsg=(body.messageData?.textMessageData?.textMessage || "").trim();

if(!SESSIONS[chatId]){

SESSIONS[chatId]={
items:[],
area:null,
deliveryFee:0,
history:[]
};

}

const session=SESSIONS[chatId];

/* ========================= */
/* HISTORY */
/* ========================= */

session.history.push({
role:"user",
content:userMsg
});

if(session.history.length>8){

session.history.shift();

}

/* ========================= */
/* CONFIRM ORDER */
/* ========================= */

if(userMsg.includes("تأكيد")){

const total=session.items.reduce((s,i)=>s+(i.p*i.q),0)+session.deliveryFee;

if(total===0) return;

const summary=session.items.map(i=>`${i.n} (${i.q})`).join(" , ");

await axios.post(
`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`,
{
chatId:CONFIG.ORDER_GROUP_ID,
message:`طلب جديد

العميل: ${chatId}

المنطقة: ${session.area}

الطلب: ${summary}

المجموع: ${total}`
});

session.items=[];
session.area=null;
session.deliveryFee=0;

return axios.post(
`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`,
{
chatId,
message:"تم تأكيد الطلب 👍"
});

}

/* ========================= */
/* AI RESPONSE */
/* ========================= */

const aiRes=await askAI(userMsg,session);

/* ========================= */
/* ADD ITEM */
/* ========================= */

if(aiRes.includes("[ADD:")){

const match=aiRes.match(/\[ADD:(.*?):(\d+)\]/);

if(match){

const meal=match[1];
const qty=parseInt(match[2]);

addItem(session,meal,qty);

}

}

/* ========================= */
/* CLEAN MESSAGE */
/* ========================= */

let reply=aiRes.replace(/\[.*?\]/g,"").trim();

/* ========================= */
/* CALCULATE */
/* ========================= */

const sub=session.items.reduce((s,i)=>s+(i.p*i.q),0);

if(sub>0){

reply+=`

🛒 الطلب: ${sub} دينار
🚚 التوصيل: ${session.deliveryFee}
💰 المجموع: ${sub+session.deliveryFee}

اكتب "تأكيد" لإرسال الطلب`;

}

/* ========================= */
/* SAVE HISTORY */
/* ========================= */

session.history.push({
role:"assistant",
content:reply
});

/* ========================= */
/* SEND */
/* ========================= */

await axios.post(
`${CONFIG.API_URL}/sendMessage/${CONFIG.GREEN_TOKEN}`,
{
chatId,
message:reply
});

});

/* ========================= */

app.listen(3000,()=>{

console.log("BOT RUNNING");

});
