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
    } catch (error) {
        process.exit(1);
    }
};

const getRecentMomoOrder = async () => {
    await connectDB();
    try {
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        const o = await Order.findOne({
            "items.name": { $regex: /momo/i }
        }).sort({ createdAt: -1 }).lean();

        if (o) {
            console.log('--- Order Pricing ---');
            console.log(JSON.stringify(o.pricing, null, 2));
            console.log('--- Order Meta ---');
            console.log(JSON.stringify({
                orderId: o.orderId,
                restaurantId: o.restaurantId,
                restaurant: o.restaurant?.name
            }, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

getRecentMomoOrder();
