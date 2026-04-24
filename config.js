import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
    PORT: process.env.PORT || 3000,
    OPENAI_KEY: process.env.OPENAI_KEY,
    ID_INSTANCE: process.env.ID_INSTANCE,
    GREEN_TOKEN: process.env.GREEN_TOKEN,
    PAGE_TOKEN: process.env.PAGE_TOKEN,
    FB_VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN,
    GROUP_ID: "120363407952234395@g.us", // جروب المطبخ المعتمد
    // تم تحويل الرابط تلقائياً لصيغة CSV لكي يقرأه الكود بذكاء
    PRICES_CSV_URL: "https://docs.google.com/spreadsheets/d/106hTZANAnQz5fqxSpTo0Zcykhvzr-8ovwKDLT447wrk/export?format=csv", 
    API_URL: `https://7103.api.greenapi.com/waInstance${process.env.ID_INSTANCE}`,
    MEDIA_URL: `https://7103.media.greenapi.com/waInstance${process.env.ID_INSTANCE}` // رابط الميديا الإضافي
};
