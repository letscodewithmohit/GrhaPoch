
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
        console.log(JSON.stringify(plans.map(p => ({ _id: p._id, name: p.name })), null, 2));

        const restaurants = await Restaurant.find({
            $or: [
                { businessModel: 'Subscription Base' },
                { 'subscription.planId': { $exists: true } }
            ]
        }).select('name subscription');

        console.log('--- RESTAURANTS ---');
        console.log(JSON.stringify(restaurants, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
