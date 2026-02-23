
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const order = await Order.findOne({ 'pricing.total': 126 }).sort({ createdAt: -1 });
        if (order) {
            console.log('Order found:', order.orderId);
            console.log('Restaurant Location:', JSON.stringify(order.restaurantId?.location || 'none'));
            console.log('Address Location:', JSON.stringify(order.address?.location || 'none'));
            console.log('Pricing:', JSON.stringify(order.pricing));
            console.log('Assignment Distance:', order.assignmentInfo?.distance);
            console.log('RouteToDelivery Distance:', order.deliveryState?.routeToDelivery?.distance);
        } else {
            console.log('Order not found');
        }
        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}
check();
