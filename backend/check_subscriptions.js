
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const plans = await SubscriptionPlan.find({});
        console.log('\n--- Subscription Plans ---');
        plans.forEach(p => {
            console.log(`ID: ${p._id}, Name: ${p.name}, Price: ${p.price}`);
        });

        const restaurants = await Restaurant.find({ businessModel: 'Subscription Base' });
        console.log('\n--- Restaurants with Subscription ---');
        restaurants.forEach(r => {
            console.log(`Restaurant: ${r.name}, PlanId: ${r.subscription?.planId}, Status: ${r.subscription?.status}`);
        });

        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
