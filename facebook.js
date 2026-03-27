import axios from "axios";
import { CONFIG } from "./config.js";

export async function sendFB(psid, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v21.0/me/messages?access_token=${CONFIG.PAGE_TOKEN}`,
            {
                recipient: { id: psid },
                message: { text: text }
            }
        );
        console.log(`FB/Insta Message Sent to ${psid} ✅`);
    } catch (err) {
        console.log("Error FB:", err.response?.data || err.message);
    }
}
