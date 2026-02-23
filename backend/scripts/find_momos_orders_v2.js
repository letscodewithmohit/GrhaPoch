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

const findMomosOrders = async () => {
    await connectDB();
    try {
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        // Get only the last 3 orders
        const orders = await Order.find({
            "items.name": { $regex: /momo/i }
        }).sort({ createdAt: -1 }).limit(3);

        console.log(`Last 3 Momos orders:`);
        orders.forEach(o => {
            console.log(JSON.stringify({
                orderId: o.orderId,
                deliveryFee: o.pricing?.deliveryFee,
                tip: o.pricing?.tip,
                total: o.pricing?.total,
                status: o.status,
                createdAt: o.createdAt
            }, null, 2));
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

findMomosOrders();
