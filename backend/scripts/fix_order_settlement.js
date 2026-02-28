import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';

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
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));

        const orderId = "ORD-1771667637952-398";
        const order = await Order.findOne({ orderId }).lean();

        if (order) {
            console.log('🔄 Recalculating settlement for:', orderId);
            const settlement = await calculateOrderSettlement(order._id);
            console.log('✅ Settlement updated successfully!');
            console.log('New Driver Payout:', settlement.deliveryPartnerEarning.totalEarning);
        } else {
            console.log('Order not found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

fixSettlement();
