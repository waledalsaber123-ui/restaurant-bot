import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

// الذاكرة لازم تكون برة الدالة عشان تضل محفوظة
const chatMemory = {};

export async function runAI(chatId, message) {
    // 1. إدارة الذاكرة (بنتذكر آخر 4 رسائل بس عشان نوفر كوكيز)
    if (!chatMemory[chatId]) chatMemory[chatId] = [];
    chatMemory[chatId].push({ role: "user", content: message });
    if (chatMemory[chatId].length > 4) chatMemory[chatId].shift();

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // أوفر وأسرع موديل
                temperature: 0.8, // عشان ينوع بكلامه وما يكرر "يا غالي ابشر"
                response_format: { type: "json_object" },
                messages: [
                    { 
                        role: "system", 
                        content: systemPrompt + "\nملاحظة: خليك بياع شاطر، نوع بجملك، وتذكر شو حكى الزبون قبل شوي." 
                    },
                    ...chatMemory[chatId]
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${CONFIG.OPENAI_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const aiResult = JSON.parse(res.data.choices[0].message.content);
        
        // حفظ رد البوت في الذاكرة عشان ما ينسى
        chatMemory[chatId].push({ role: "assistant", content: aiResult.reply });
        
        return aiResult;

    } catch (error) {
        console.error("AI Error Details:", error.response?.data || error.message);
        // الرد هاد بيطلع بس لما السيرفر يوقع
        return { 
            reply: "من عيوني يا غالي، بس ثواني خليني أشيكلك ع الطلب وأرجعلك.. شو كنت حابب تضيف كمان؟",
            totalPrice: 0 
        };
    }
}
