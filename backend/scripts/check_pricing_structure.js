import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/order/models/Order.js';

dotenv.config();

const orderId = 'ORD-1771926351724-847';

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const order = await Order.findOne({ orderId }).lean();
        console.log('ORDER DATA structure:');
        console.log(JSON.stringify(order.pricing, null, 2));

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

check();
