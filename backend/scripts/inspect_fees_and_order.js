import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const inspectFeeSettings = async () => {
    await connectDB();
    try {
        const FeeSettings = mongoose.model('FeeSettings', new mongoose.Schema({}, { strict: false }));
        const settings = await FeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });

        if (settings) {
            console.log('--- Active Fee Settings ---');
            console.log(JSON.stringify(settings, null, 2));
        } else {
            console.log('No active fee settings found.');
        }

        // Also check recent orders for "Momos"
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        const momosOrder = await Order.findOne({
            "items.name": { $regex: /momo/i }
        }).sort({ createdAt: -1 });

        if (momosOrder) {
            console.log('\n--- Recent Momos Order ---');
            console.log(JSON.stringify({
                orderId: momosOrder.orderId,
                status: momosOrder.status,
                pricing: momosOrder.pricing,
                restaurant: momosOrder.restaurant?.name
            }, null, 2));
        } else {
            console.log('No recent Momos order found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

inspectFeeSettings();
