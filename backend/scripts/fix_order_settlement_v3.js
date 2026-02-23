import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../modules/order/models/Order.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import { calculateOrderSettlement } from '../modules/order/services/orderSettlementService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (error) {
        process.exit(1);
    }
};

const fixSettlement = async () => {
    await connectDB();
    try {
        const orderIdStr = "ORD-1771667637952-398";
        const order = await Order.findOne({ orderId: orderIdStr });

        if (order) {
            console.log('Order found:', order.orderId);
            const settlement = await calculateOrderSettlement(order._id);
            console.log('Settlement Recalculated!');
            console.log('--- New Settlement Data ---');
            console.log(JSON.stringify(settlement.deliveryPartnerEarning, null, 2));
        } else {
            console.log('Order not found in DB.');
        }

    } catch (error) {
        console.error('Error during settlement fix:', error);
    } finally {
        mongoose.connection.close();
    }
};

fixSettlement();
