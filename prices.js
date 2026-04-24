import axios from 'axios';
import { CONFIG } from './config.js';

export let deliveryPrices = {};
export let deliveryPricesText = "";

export async function fetchDeliveryPrices() {
    try {
        const response = await axios.get(CONFIG.PRICES_CSV_URL);
        const rows = response.data.split('\n').slice(1); 
        let tempPrices = [];

        rows.forEach(row => {
            const [area, price] = row.split(',');
            if (area && price) {
                tempPrices.push(`${area.trim()}: ${price.trim()} JD`);
            }
        });

        deliveryPricesText = tempPrices.join('\n');
        console.log("✅ تم تحديث قائمة أسعار التوصيل بنجاح.");
    } catch (error) {
        console.error("❌ خطأ في سحب أسعار التوصيل:", error.message);
        deliveryPricesText = "يرجى التواصل مع الإدارة لمعرفة سعر التوصيل.";
    }
}

// تحديث الأسعار كل ساعة تلقائياً
setInterval(fetchDeliveryPrices, 60 * 60 * 1000);
