
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('--- DB PLANS ---');
        const plans = await SubscriptionPlan.find({});
        const planMap = {};
        plans.forEach(p => {
            console.log(`ID: ${p._id} | NAME: ${p.name}`);
            planMap[p._id.toString()] = p.name;
        });

        console.log('\n--- RESTAURANT SUBSCRIPTIONS ---');
        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base'
        }).select('name subscription');

        restaurants.forEach(r => {
            const planId = r.subscription?.planId?.toString();
            const currentNameInDB = r.subscription?.planName;
            const mappedNameFromID = planMap[planId] || 'UNKNOWN';
            console.log(`RESTAURANT: ${r.name}`);
            console.log(`  Stored Plan ID: ${planId}`);
            console.log(`  Stored Plan Name: ${currentNameInDB}`);
            console.log(`  Mapped Name (from ID): ${mappedNameFromID}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
