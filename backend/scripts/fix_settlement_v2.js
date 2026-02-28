import mongoose from 'mongoose';
import Order from '../models/Order.js';
import OrderSettlement from '../models/OrderSettlement.js';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';
import dotenv from 'dotenv';

dotenv.config();

const orderIdStr = 'ORD-1771926351724-847';

async function fixOrder() {
    try {
        console.log('Connecting...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const order = await Order.findOne({ orderId: orderIdStr });
        if (!order) {
            console.log('Order not found');
            return;
        }
        console.log('Order found:', order._id);

        console.log('Recalculating...');
        const result = await calculateOrderSettlement(order._id);
        console.log('Recalculation success!');
        console.log('New basePayout:', result.deliveryPartnerEarning.basePayout);
        console.log('New totalEarning:', result.deliveryPartnerEarning.totalEarning);

        await mongoose.disconnect();
    } catch (err) {
        console.error('CRASHED:', err);
        process.exit(1);
    }
}

fixOrder();
