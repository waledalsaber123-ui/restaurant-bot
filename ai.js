import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

export async function runAI(message) {
    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
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

        return JSON.parse(res.data.choices[0].message.content);
    } catch (error) {
         console.error("AI Error:", error.message);
         return { reply: "عذرا يا غالي، صار في ضغط على النظام. ممكن تعيد رسالتك؟ 🙏" };
    }
}
