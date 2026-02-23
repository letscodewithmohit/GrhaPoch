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
        const orders = await Order.find({
            "items.name": { $regex: /momo/i }
        }).sort({ createdAt: -1 });

        console.log(`Found ${orders.length} Momos orders:`);
        orders.forEach(o => {
            console.log(`ID: ${o.orderId}, DelFee: ${o.pricing?.deliveryFee}, Tip: ${o.pricing?.tip}, Total: ${o.pricing?.total}, Status: ${o.status}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

findMomosOrders();
