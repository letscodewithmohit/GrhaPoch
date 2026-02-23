
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const ids = ['ORD-1771837683838-780', 'ORD-1771839820929-586'];
    const orders = await Order.find({ orderId: { $in: ids } });
    for (const o of orders) {
        console.log(`OrderID: ${o.orderId} | RID: ${o.restaurantId} | RName: ${o.restaurantName}`);
    }
    await mongoose.disconnect();
}
check();
