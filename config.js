import dotenv from "dotenv"
dotenv.config()

export const CONFIG = {
    PORT: process.env.PORT || 3000,
    OPENAI_KEY: process.env.OPENAI_KEY,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    ID_INSTANCE: process.env.ID_INSTANCE,
    PAGE_TOKEN: process.env.PAGE_TOKEN, // 👈 ضفنا هذا السطر للفيسبوك
    GROUP_ID: "120363407952234395@g.us",
    DELIVERY_SHEET_URL: process.env.DELIVERY_SHEET_URL,
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
}
