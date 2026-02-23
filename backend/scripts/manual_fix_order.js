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

const manualFix = async () => {
    await connectDB();
    try {
        const OrderSettlement = mongoose.model('OrderSettlement', new mongoose.Schema({}, { strict: false }));

        const orderId = "ORD-1771667637952-398";

        // Update settlement directly
        const result = await OrderSettlement.updateOne(
            { orderNumber: orderId },
            {
                $set: {
                    "deliveryPartnerEarning.basePayout": 21,
                    "deliveryPartnerEarning.totalEarning": 31 // 21 Base + 10 Tip
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log('✅ Successfully fixed settlement for driver!');
        } else {
            console.log('❌ Settlement not found or already fixed.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

manualFix();
