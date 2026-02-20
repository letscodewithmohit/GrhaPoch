import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Temporary models for the script
const subscriptionPlanSchema = new mongoose.Schema({
    dishLimit: { type: Number, default: 0 }
}, { strict: false });

const restaurantSchema = new mongoose.Schema({
    dishLimit: { type: Number, default: 0 }
}, { strict: false });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const Restaurant = mongoose.model('Restaurant', restaurantSchema);

async function run() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('MONGODB_URI not found in .env');
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const planResult = await SubscriptionPlan.updateMany({}, { $set: { dishLimit: 0 } });
        console.log(`Updated ${planResult.modifiedCount} subscription plans to unlimited (0)`);

        const restaurantResult = await Restaurant.updateMany({}, { $set: { dishLimit: 0 } });
        console.log(`Updated ${restaurantResult.modifiedCount} restaurants to unlimited (0)`);

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
