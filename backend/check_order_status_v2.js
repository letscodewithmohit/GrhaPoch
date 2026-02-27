
import mongoose from 'mongoose';
import Order from './modules/order/models/Order.js';
import OrderSettlement from './modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkSettlement() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orderIdStr = 'ORD-1771926351724-847';
        const order = await Order.findOne({ orderId: orderIdStr }).lean();
        const settlement = await OrderSettlement.findOne({ orderNumber: orderIdStr }).lean();

        if (order) {
            console.log('--- Order Details ---');
            console.log('Distance in assignmentInfo:', order.assignmentInfo?.distance);
            console.log('User Delivery Fee:', order.pricing?.deliveryFee);
        }

        if (settlement) {
            console.log('\n--- Settlement Found ---');
            console.log('Delivery Margin:', settlement.adminEarning.deliveryMargin);
            console.log('Partner Base Payout:', settlement.deliveryPartnerEarning.basePayout);
            console.log('Partner Distance Comm:', settlement.deliveryPartnerEarning.distanceCommission);
            console.log('Partner Tip:', settlement.deliveryPartnerEarning.tip);
            console.log('Partner Total:', settlement.deliveryPartnerEarning.totalEarning);
            console.log('Admin Total:', settlement.adminEarning.totalEarning);
        } else {
            console.log('Settlement not found');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSettlement();
