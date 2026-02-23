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

const inspectRestaurant = async () => {
    await connectDB();
    try {
        const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
        const res = await Restaurant.findById("6992fc34cbacf56097752015").lean();

        if (res) {
            console.log('--- Restaurant Info ---');
            console.log(JSON.stringify(res, null, 2));
        } else {
            console.log('Restaurant not found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

inspectRestaurant();
