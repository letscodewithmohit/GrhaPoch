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

const inspectOrder = async () => {
    await connectDB();
    try {
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        const OrderSettlement = mongoose.model('OrderSettlement', new mongoose.Schema({}, { strict: false }));

        const orderId = "ORD-1771667637952-398";
        const order = await Order.findOne({ orderId }).lean();
        const settlement = await OrderSettlement.findOne({ orderNumber: orderId }).lean();

        console.log('--- Order Details ---');
        if (order) {
            console.log(JSON.stringify({
                orderId: order.orderId,
                pricing: order.pricing,
                deliveryFee: order.pricing?.deliveryFee,
                tip: order.pricing?.tip,
                assignmentInfo: order.assignmentInfo,
                deliveryPartnerId: order.deliveryPartnerId,
                total: order.pricing?.total
            }, null, 2));
        } else {
            console.log('Order not found.');
        }

        console.log('\n--- Settlement Details ---');
        if (settlement) {
            console.log(JSON.stringify(settlement, null, 2));
        } else {
            console.log('Settlement not found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

inspectOrder();
