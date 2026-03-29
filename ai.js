import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

// مخزن الذاكرة المؤقت (بينمسح بس يطفي السيرفر - ممتاز للتوفير)
const chatMemory = {};

export async function runAI(chatId, message) {
    // 1. إدارة الذاكرة
    if (!chatMemory[chatId]) chatMemory[chatId] = [];
    chatMemory[chatId].push({ role: "user", content: message });
    
    // الاحتفاظ بآخر 6 رسائل فقط لتوفير "الكوكيز"
    if (chatMemory[chatId].length > 6) chatMemory[chatId].shift();

    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Amman", hour: '2-digit', minute: '2-digit' });

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // موديل سريع ورخيص جداً
                temperature: 0.7, // عشان "يشكل" بالكلام وما يضل يكرر نفسه
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: `${systemPrompt}\nالوقت: ${currentTime}` },
                    ...chatMemory[chatId] // إرسال سياق المحادثة
                ]
            },
            { headers: { Authorization: `Bearer ${CONFIG.OPENAI_KEY}` } }
        );

        const aiResult = JSON.parse(res.data.choices[0].message.content);
        
        // حفظ رد البوت في الذاكرة
        chatMemory[chatId].push({ role: "assistant", content: aiResult.reply });

        return aiResult;
    } catch (error) {
        return { reply: "يا غالي ابشر، ثواني وبكون معك." };
    }
}
