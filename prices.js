import axios from 'axios';
import Papa from 'papaparse';
import { CONFIG } from './config.js';

export let deliveryPricesText = "جاري تحميل الأسعار...";

// دالة لجلب الأسعار من رابط Google Sheets
export async function fetchDeliveryPrices() {
    try {
        if (!CONFIG.PRICES_CSV_URL) {
            deliveryPricesText = "تنبيه: رابط أسعار التوصيل غير متوفر.";
            return;
        }

        const response = await axios.get(CONFIG.PRICES_CSV_URL);
        const parsed = Papa.parse(response.data, { header: true, skipEmptyLines: true });
        
        let textBuilder = "أسعار التوصيل المعتمدة:\n";
        parsed.data.forEach(row => {
            // يبحث عن عمود "المنطقة" وعمود "السعر"
            const region = row['المنطقة'] || row['region'] || Object.values(row)[0];
            const price = row['السعر'] || row['price'] || Object.values(row)[1];
            if (region && price) {
                textBuilder += `- ${region}: ${price} دنانير\n`;
            }
        });

        deliveryPricesText = textBuilder;
        console.log("تم تحديث أسعار التوصيل من ملف الدرايف بنجاح!");
    } catch (error) {
        console.error("خطأ في جلب أسعار التوصيل:", error.message);
    }
}

// تحديث الأسعار كل ساعة تلقائياً (60 دقيقة * 60 ثانية * 1000 ملي ثانية)
setInterval(fetchDeliveryPrices, 60 * 60 * 1000);
