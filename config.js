import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
    PORT: process.env.PORT || 3000,
    OPENAI_KEY: process.env.OPENAI_KEY,
    ID_INSTANCE: process.env.ID_INSTANCE,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    PAGE_TOKEN: process.env.PAGE_TOKEN,
    GROUP_ID: "120363407952234395@g.us", // تأكد من الـ ID للجروب
    // الرابط الموحد لـ Green-API حسب الـ Logs تبعتك
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`
};
