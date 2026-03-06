app.post("/webhook", async (req, res) => {
    res.sendStatus(200); // رد فوري لمنع التعليق

    try {
        const chatId = req.body.senderData?.chatId;
        if (!chatId || chatId.endsWith("@g.us")) return;

        let message = req.body.messageData?.textMessageData?.textMessage || "";

        // 1. استخدام الذكاء الاصطناعي لفهم "النية" والأصناف (حل مشكلة الأخطاء الإملائية)
        const aiResponse = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `أنت مساعد مطعم. المنيو المتاحة: ${Object.keys(MENU).join(", ")}. 
                إذا طلب العميل صنفاً (حتى بلهجة عامية أو خطأ إملائي)، استخرج الاسم الرسمي له من المنيو.
                رد بصيغة JSON فقط: {"item": "الاسم الرسمي أو null", "reply": "ردك للعميل"}` },
                { role: "user", content: message }
            ],
            response_format: { type: "json_object" }
        }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` } });

        const result = JSON.parse(aiResponse.data.choices[0].message.content);

        // 2. إذا وجد الذكاء الاصطناعي صنفاً
        if (result.item && MENU[result.item]) {
            const item = result.item;
            if (IMAGES[item]) {
                await sendImage(chatId, IMAGES[item], `أبشر! تم اختيار ${item}.`);
            }
            await send(chatId, result.reply || MESSAGES.upsell);
            return;
        }

        // 3. إذا لم يفهم أو كانت دردشة عادية
        await send(chatId, result.reply || MESSAGES.welcome);

    } catch (e) {
        console.error("Webhook Error:", e.message);
    }
});
