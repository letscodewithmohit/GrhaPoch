
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

const subscriptionPlanSchema = new mongoose.Schema({}, { strict: false });
const restaurantSchema = new mongoose.Schema({}, { strict: false });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const Restaurant = mongoose.model('Restaurant', restaurantSchema);

const fixData = async () => {
    await connectDB();

    try {
        // 1. Update Plans with dish limits
        console.log('Updating Subscription Plans...');

        // Basic Plan - 50 dishes
        await SubscriptionPlan.updateOne(
            { name: 'Basic Plan' },
            { $set: { dishLimit: 50 } }
        );
        console.log('Updated Basic Plan to 50 dishes');

        // Growth Plan - 100 dishes
        await SubscriptionPlan.updateOne(
            { name: 'Growth Plan' },
            { $set: { dishLimit: 100 } }
        );
        console.log('Updated Growth Plan to 100 dishes');

        // Premium Plan - 0 (Unlimited)
        await SubscriptionPlan.updateOne(
            { name: 'Premium Plan' },
            { $set: { dishLimit: 0 } }
        );
        console.log('Updated Premium Plan to Unlimited (0)');

        // 2. Fix Sumit's Pizza
        // It is on Basic Plan, so set to 50
        console.log('Updating Sumit\'s Pizza...');
        const result = await Restaurant.updateOne(
            { name: { $regex: /Sumit's Pizza/i } },
            {
                $set: {
                    dishLimit: 50,
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
