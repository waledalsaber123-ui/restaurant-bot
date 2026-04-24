import axios from 'axios';
import { CONFIG } from './config.js';

export async function sendFacebookMessage(recipientId, message) {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${CONFIG.PAGE_TOKEN}`;
    try {
        await axios.post(url, {
            recipient: { id: recipientId },
            message: { text: message }
        });
    } catch (error) {
        console.error(`Facebook Error (${recipientId}):`, error.response ? error.response.data : error.message);
    }
}
