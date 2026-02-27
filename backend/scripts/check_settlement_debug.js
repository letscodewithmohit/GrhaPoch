import mongoose from 'mongoose';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';

dotenv.config();

const orderId = 'ORD-1771926351724-847';

async function checkOrder() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const order = await Order.findOne({ orderId: orderId });
        if (!order) {
            console.log('Order not found');
            return;
        }

        console.log('--- ORDER DETAILS ---');
        console.log('Order ID:', order.orderId);
        console.log('Partner ID:', order.deliveryPartnerId);
        console.log('Assignment Info:', JSON.stringify(order.assignmentInfo, null, 2));
        console.log('Pricing:', JSON.stringify(order.pricing, null, 2));

        const settlement = await OrderSettlement.findOne({ orderNumber: orderId });
        if (settlement) {
            console.log('\n--- SETTLEMENT DETAILS ---');
            console.log('Delivery Partner Earning:', JSON.stringify(settlement.deliveryPartnerEarning, null, 2));
            console.log('User Payment:', JSON.stringify(settlement.userPayment, null, 2));
            console.log('Admin Earning:', JSON.stringify(settlement.adminEarning, null, 2));
        } else {
            console.log('\nSettlement not found');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkOrder();
