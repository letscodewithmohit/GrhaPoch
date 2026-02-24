import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkData() {
    try {
        await mongoose.connect(MONGODB_URI);
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }), 'orders');
        const orders = await Order.find({ "pricing.total": 126 }).sort({ createdAt: -1 });

        fs.writeFileSync(path.join(__dirname, 'order_126_output.txt'), JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkData();
