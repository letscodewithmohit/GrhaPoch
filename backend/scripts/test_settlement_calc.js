import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';
import Order from '../models/Order.js';

dotenv.config();

const orderIdStr = 'ORD-1771926351724-847';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const order = await Order.findOne({ orderId: orderIdStr });
        if (!order) {
            console.log('Order not found');
            process.exit(1);
        }

        console.log('Running calculateOrderSettlement for order:', order._id);
        const settlement = await calculateOrderSettlement(order._id);

        console.log('RESULTING SETTLEMENT:');
        console.log(JSON.stringify(settlement, null, 2));

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

run();
