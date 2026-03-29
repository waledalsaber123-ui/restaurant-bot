import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js"; // استيراد البرومبت من الملف مباشرة

// ذاكرة ذكية لكل زبون (بتحفظ آخر 6 رسائل عشان التوفير والذكاء)
const chatMemory = {};

export async function runAI(chatId, message) {
    const id = chatId || "default";

    // 1. إدارة الذاكرة
    if (!chatMemory[id]) chatMemory[id] = [];
    chatMemory[id].push({ role: "user", content: message });
    
    // الاحتفاظ بآخر 6 رسائل فقط (عشان نوفر "كوكيز" ونضل بالcontext الصحيح)
    if (chatMemory[id].length > 6) chatMemory[id].shift();

    const currentTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Amman",
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    try {
        console.log(`🚀 AI Processing for: ${id}`);

        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // أسرع وأرخص موديل بيفهم اللهجة الأردنية
                temperature: 0.8,    // درجة "الدردشة" عشان ينوع بكلامه وما يكرر نفسه
                response_format: { type: "json_object" },
                messages: [
                    { 
                        role: "system", 
                        content: `${systemPrompt}\n\n[وقت عمان الآن: ${currentTime}]\n[تنبيه: نوع بجملك، وتذكر تفاصيل طلب الزبون ومنطقته].` 
                    },
                    ...chatMemory[id]
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${CONFIG.OPENAI_KEY.trim()}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const aiResult = JSON.parse(res.data.choices[0].message.content);
        
        // حفظ رد البوت في الذاكرة عشان المحادثة تضل متصلة
        chatMemory[id].push({ role: "assistant", content: aiResult.reply });
        
        return {
            reply: aiResult.reply || "تفضل يا غالي، كيف بقدر أخدمك؟",
            kitchenOrder: aiResult.kitchenOrder || "",
            totalPrice: aiResult.totalPrice || 0
        };

    } catch (error) {
        // طباعة الخطأ الحقيقي في Render Logs لمعرفة السبب (رصيد، مفتاح، الخ)
        console.error("❌ AI ERROR:", error.response?.data || error.message);
        
        return { 
            reply: "أبشر يا نشمي، بس ثواني خليني أشيكلك
