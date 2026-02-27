
import mongoose from 'mongoose';
import OrderSettlement from './modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkSettlement() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orderIdStr = 'ORD-1771926351724-847';
        const settlement = await OrderSettlement.findOne({ orderNumber: orderIdStr }).lean();

        if (settlement) {
            console.log(JSON.stringify(settlement, null, 2));
        } else {
            console.log('Settlement not found');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSettlement();
