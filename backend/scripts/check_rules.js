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

const checkRules = async () => {
    await connectDB();
    try {
        const Rule = mongoose.model('DeliveryBoyCommission', new mongoose.Schema({}, { strict: false }));
        const rules = await Rule.find({ status: true }).lean();
        console.log('--- Active Commission Rules ---');
        console.log(JSON.stringify(rules, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

checkRules();
