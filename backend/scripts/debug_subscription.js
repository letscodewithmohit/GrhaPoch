
import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const checkMohitSubscription = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('Error: MONGODB_URI not found in .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find restaurant with "Mohit" in the name (case-insensitive)
        const restaurants = await Restaurant.find({ name: { $regex: 'Mohit', $options: 'i' } });

        if (restaurants.length === 0) {
            console.log('No restaurant found with name "Mohit"');
        } else {
            console.log(`Found ${restaurants.length} restaurant(s) matching "Mohit":`);
            for (const r of restaurants) {
                console.log(`\nRestaurant: ${r.name} (${r._id})`);
                console.log('Subscription:', r.subscription);
                console.log('Business Model:', r.businessModel);

                if (r.subscription && r.subscription.planId) {
                    const planId = r.subscription.planId;
                    console.log('Plan ID from subscription:', planId, typeof planId);

                    try {
                        // Check if this plan exists
                        const plan = await SubscriptionPlan.findById(planId);
                        if (plan) {
                            console.log('MATCHING PLAN FOUND:', plan.name, `(${plan._id})`);
                        } else {
                            console.log('WARNING: Plan ID does not exist in SubscriptionPlan collection!');
                        }
                    } catch (err) {
                        console.log('Invalid ObjectId format for planId:', planId);
                    }
                }
            }
        }

        // List all available plans for reference
        const allPlans = await SubscriptionPlan.find({});
        console.log('\n--- Available Plans ---');
        allPlans.forEach(p => console.log(`${p.name}: ${p._id}`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
        process.exit(0);
    }
};

checkMohitSubscription();
