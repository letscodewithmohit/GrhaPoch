
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function checkOrders() {
    await mongoose.connect(process.env.MONGODB_URI);
    const ids = ['ORD-1771837683838-780', 'ORD-1771839820929-586'];
    const orders = await Order.find({ orderId: { $in: ids } });
    console.log(JSON.stringify(orders.map(o => ({
        orderId: o.orderId,
        restaurantId: o.restaurantId,
        restaurantName: o.restaurantName,
        pricing: o.pricing
    })), null, 2));
    await mongoose.disconnect();
}
checkOrders();
