
import mongoose from 'mongoose';
import OrderSettlement from './modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';

dotenv.config();

async function findNegativeMargins() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const settlements = await OrderSettlement.find({ 'adminEarning.deliveryMargin': { $lt: 0 } }).limit(5).lean();

        console.log(`Found ${settlements.length} settlements with negative margins.`);
        settlements.forEach(s => {
            console.log(`Order: ${s.orderNumber}, Margin: ${s.adminEarning.deliveryMargin}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

findNegativeMargins();
