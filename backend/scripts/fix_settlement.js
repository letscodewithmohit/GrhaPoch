import mongoose from 'mongoose';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import { calculateOrderSettlement } from '../modules/order/services/orderSettlementService.js';
import dotenv from 'dotenv';

dotenv.config();

const orderIdStr = 'ORD-1771926351724-847';

async function fixOrder() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const order = await Order.findOne({ orderId: orderIdStr });
        if (!order) {
            console.log('Order not found');
            return;
        }

        console.log('Original Settlement Data Found. Triggering recalculation...');

        // Trigger recalculation
        const updatedSettlement = await calculateOrderSettlement(order._id);

        console.log('\n--- UPDATED SETTLEMENT DETAILS ---');
        console.log('Delivery Partner Earning:', JSON.stringify(updatedSettlement.deliveryPartnerEarning, null, 2));
        console.log('User Payment Delivery Fee:', updatedSettlement.userPayment.deliveryFee);

        await mongoose.disconnect();
        console.log('\nDone.');
    } catch (err) {
        console.error('Error:', err);
    }
}

fixOrder();
