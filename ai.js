import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

const chatMemory = {};

export async function runAI(chatId, message) {
    const id = chatId || "default";
    if (!chatMemory[id]) chatMemory[id] = [];
    
    chatMemory[id].push({ role: "user", content: message });
    if (chatMemory[id].length > 4) chatMemory[id].shift();

    try {
        console.log("🚀 Calling OpenAI..."); // للفحص

        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                temperature: 0.8,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
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
        chatMemory[id].push({ role: "assistant", content: aiResult.reply });
        
        return aiResult;

    } catch (error) {
        // 🔥 هذا السطر سيطبع الخطأ الحقيقي في Render Logs
        console.error("❌ AI ERROR DETAIL:", error.response?.data || error.message);
        
        return { 
            reply: "ابشر يا نشمي، بس ثواني خليني اشيكلك ع الطلب.. شو بدك نزيد عليه؟",
            totalPrice: 0 
        };
    }
}
