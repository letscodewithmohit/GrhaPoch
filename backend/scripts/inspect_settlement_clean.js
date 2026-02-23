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
        const settlement = await OrderSettlement.findOne({ orderNumber: orderId }).lean();

        if (settlement) {
            console.log('--- Delivery Partner Earning ---');
            console.log(JSON.stringify(settlement.deliveryPartnerEarning, null, 2));
            console.log('\n--- Admin Earning ---');
            console.log(JSON.stringify(settlement.adminEarning, null, 2));
            console.log('\n--- User Payment ---');
            console.log(JSON.stringify(settlement.userPayment, null, 2));
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
