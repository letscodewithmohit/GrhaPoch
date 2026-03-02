
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
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const restaurantSchema = new mongoose.Schema({}, { strict: false });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

const fixData = async () => {
    await connectDB();

    try {
        console.log('Updating Sumit\'s Pizza subscription status...');
        const result = await Restaurant.updateOne(
            { name: { $regex: /Sumit's Pizza/i } },
            {
                $set: {
                    businessModel: 'Subscription Base',
                    'subscription.status': 'active'
                }
            }
        );
        console.log(`Updated Sumit's Pizza: ${result.modifiedCount} document(s) modified`);

    } catch (error) {
        console.error(error);
    } finally {
        mongoose.connection.close();
    }
};

fixData();
