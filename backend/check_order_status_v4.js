
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
            console.log('User Payment:', settlement.userPayment);
            console.log('Delivery Partner Earning:', settlement.deliveryPartnerEarning);
            console.log('Admin Earning:', settlement.adminEarning);
        } else {
            console.log('Settlement not found');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSettlement();
