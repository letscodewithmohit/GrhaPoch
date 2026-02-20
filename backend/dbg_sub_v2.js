
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const plans = await SubscriptionPlan.find({});
        console.log('--- PLANS ---');
        plans.forEach(p => console.log(`PLAN: ${p._id} | NAME: ${p.name}`));

        const restaurants = await Restaurant.find({
            'subscription.planId': { $exists: true }
        }).select('name subscription');

        console.log('--- RESTAURANTS ---');
        restaurants.forEach(r => {
            console.log(`RESTAURANT: ${r.name} | SUB_PLAN_ID: ${r.subscription?.planId} | SUB_PLAN_NAME: ${r.subscription?.planName}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
