import axios from "axios";
import { CONFIG } from "./config.js";
import { systemPrompt } from "./prompt.js";

/**
 * دالة تشغيل الذكاء الاصطناعي المحسنة
 * تم إضافة الوقت الحالي لضمان دقة الردود بخصوص ساعات العمل
 */
export async function runAI(message) {
    // الحصول على الوقت الحالي بتوقيت الأردن
    const currentTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Amman",
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    try {
        const res = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                // درجة حرارة 0 تعني التزام حرفي بالبيانات والأسعار المرفقة في البرومبت
                temperature: 0, 
                response_format: { type: "json_object" },
                messages: [
                    { 
                        role: "system", 
                        content: `${systemPrompt}\n\n[الوقت الحالي في عمان الآن: ${currentTime}]` 
                    },
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

        // تحويل النص المستلم إلى كائن JSON
        const aiResult = JSON.parse(res.data.choices[0].message.content);
        
        // التحقق من أن الرد يحتوي على العناصر الأساسية لتجنب أخطاء السيرفر
        return {
            reply: aiResult.reply || "تفضل يا غالي، كيف بقدر أخدمك؟",
            kitchenOrder: aiResult.kitchenOrder || "",
            totalPrice: aiResult.totalPrice || 0
        };

    } catch (error) {
        console.error("❌ AI Error Details:", error.response?.data || error.message);
        
        // رد احتياطي في حال حدوث خطأ في الاتصال بـ OpenAI
        return { 
            reply: "عذراً يا غالي، صار في ضغط بسيط بالنظام. ممكن تعيد طلبك أو استفسارك؟ 🙏",
            kitchenOrder: "",
            totalPrice: 0
        };
    }
}
