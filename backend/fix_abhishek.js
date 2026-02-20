
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';

dotenv.config();

const fixAbhishek = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Find Premium Plan ID
        const premiumPlan = await SubscriptionPlan.findOne({ name: 'Premium' });
        if (!premiumPlan) {
            console.log('Premium plan not found');
            process.exit(1);
        }

        const result = await Restaurant.findOneAndUpdate(
            { name: 'Abhishek restaurant' },
            {
                $set: {
                    'subscription.planId': premiumPlan._id,
                    'subscription.planName': 'Premium',
                    'businessModel': 'Subscription Base',
                    'dishLimit': premiumPlan.dishLimit || 100 // Set a high limit for premium
                }
            },
            { new: true }
        );

        if (result) {
            console.log(`Successfully updated ${result.name} to Premium`);
            console.log('Current Subscription:', JSON.stringify(result.subscription, null, 2));
        } else {
            console.log('Restaurant "Abhishek restaurant" not found');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

fixAbhishek();
