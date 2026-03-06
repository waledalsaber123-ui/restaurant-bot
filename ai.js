import axios from "axios"
import {CONFIG} from "./config.js"

export async function runAI(message){

const res = await axios.post(
"https://api.openai.com/v1/chat/completions",
{
model: "gpt-4o-mini",
temperature: 0,
response_format:{type:"json_object"},
messages:[
{
role:"system",
content:`
انت مساعد طلبات لمطعم.

ارجع JSON فقط بهذا الشكل:

{
intent:"",
items:[],
reply:""
}

intent يمكن ان يكون:

order
confirm
address
question

مثال:

اذا قال العميل:
بدي 2 ديناميت

ارجع:

{
"intent":"order",
"items":[{"name":"ديناميت","qty":2}],
"reply":"تمام يا غالي 👌 تم إضافة الطلب"
}
`
},
{
role:"user",
content:message
}
]
},
{
headers:{
Authorization:`Bearer ${CONFIG.OPENAI_KEY}`,
"Content-Type":"application/json"
}
}
)

return JSON.parse(res.data.choices[0].message.content)

}
