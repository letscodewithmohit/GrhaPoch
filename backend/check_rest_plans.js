
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const plans = await SubscriptionPlan.find({});
        const planMap = {};
        console.log('--- ALL SUBSCRIPTION PLANS ---');
        plans.forEach(p => {
            console.log(`PLAN ID: ${p._id} | NAME: ${p.name} | PRICE: ${p.price}`);
            planMap[p._id.toString()] = p.name;
        });

        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base'
        }).select('name subscription businessModel');

        console.log('\n--- RESTAURANTS ON SUBSCRIPTION ---');
        if (restaurants.length === 0) {
            console.log('No restaurants found on Subscription Base model.');
        } else {
            restaurants.forEach(r => {
                const sub = r.subscription || {};
                const planId = sub.planId ? sub.planId.toString() : 'NONE';
                const actualPlanName = planMap[planId] || 'Plan Not Found in DB';
                console.log(`RESTAURANT: ${r.name}`);
                console.log(`  - Plan ID in DB: ${planId}`);
                console.log(`  - Plan Name in DB: ${sub.planName || 'Not Saved'}`);
                console.log(`  - Actual Plan Name (Mapped): ${actualPlanName}`);
                console.log(`  - Status: ${sub.status}`);
            });
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
