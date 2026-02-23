
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import DeliveryWallet from './modules/delivery/models/DeliveryWallet.js';
import DeliveryBoyCommission from './modules/admin/models/DeliveryBoyCommission.js';

dotenv.config();

async function checkOrders() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const orders = await Order.find({ 'pricing.total': 126 }).sort({ createdAt: -1 }).limit(5);

        if (orders.length === 0) {
            console.log('No orders found with total 126');
            const latestOrders = await Order.find().sort({ createdAt: -1 }).limit(5);
            console.log('Latest 5 orders totals:', latestOrders.map(o => o.pricing.total));
        }

        for (const order of orders) {
            console.log(`--- Order ${order.orderId} ---`);
            console.log('Status:', order.status);
            console.log('Pricing:', JSON.stringify(order.pricing, null, 2));
            console.log('Assignment Info:', JSON.stringify(order.assignmentInfo, null, 2));
            console.log('Delivery State:', JSON.stringify(order.deliveryState, null, 2));

            if (order.deliveryPartnerId) {
                const wallet = await DeliveryWallet.findOne({ deliveryId: order.deliveryPartnerId });
                if (wallet) {
                    const transaction = wallet.transactions.find(t => t.orderId && t.orderId.toString() === order._id.toString());
                    console.log('Wallet Transaction for this order:', JSON.stringify(transaction, null, 2));
                    console.log('Wallet cashInHand:', wallet.cashInHand);
                    console.log('Wallet totalBalance:', wallet.totalBalance);
                }
            }
        }

        const activeRules = await DeliveryBoyCommission.find({ status: true });
        console.log('Active Commission Rules:', JSON.stringify(activeRules, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkOrders();
