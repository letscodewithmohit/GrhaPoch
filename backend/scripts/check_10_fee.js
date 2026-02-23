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

const findOrdersWithSpecificFee = async () => {
    await connectDB();
    try {
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        const orders = await Order.find({
            "items.name": { $regex: /momo/i },
            "pricing.deliveryFee": 10
        });

        console.log(`Found ${orders.length} Momos orders with Delivery Fee = 10:`);
        orders.forEach(o => {
            console.log(`ID: ${o.orderId}, DelFee: ${o.pricing?.deliveryFee}, Tip: ${o.pricing?.tip}, Total: ${o.pricing?.total}`);
        });

        // Also search for any order with tip 10 and del fee something else
        const tip10 = await Order.find({
            "items.name": { $regex: /momo/i },
            "pricing.tip": 10
        }).limit(5);

        console.log(`\nMomos orders with Tip = 10:`);
        tip10.forEach(o => {
            console.log(`ID: ${o.orderId}, DelFee: ${o.pricing?.deliveryFee}, Tip: ${o.pricing?.tip}, Status: ${o.status}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

findOrdersWithSpecificFee();
