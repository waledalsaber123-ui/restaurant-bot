import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

export async function runAI(message) {
    const currentTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Amman",
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: `${systemPrompt}\n\n[وقت عمان الآن: ${currentTime}]` },
                    { role: "user", content: message }
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
        return {
            reply: aiResult.reply || "تفضل يا غالي، كيف بقدر أخدمك؟",
            kitchenOrder: aiResult.kitchenOrder || "",
            totalPrice: aiResult.totalPrice || 0
        };
    } catch (error) {
        console.error("❌ AI Error:", error.message);
        return { reply: "يا غالي صار ضغط عالثواني، ممكن تعيد طلبك؟ 🙏", kitchenOrder: "", totalPrice: 0 };
    }
}
