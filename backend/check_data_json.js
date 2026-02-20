
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import SubscriptionPlan from './modules/admin/models/SubscriptionPlan.js';
import fs from 'fs';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const plans = await SubscriptionPlan.find({});
        const planList = plans.map(p => ({ id: p._id.toString(), name: p.name }));
        const planMap = {};
        planList.forEach(p => planMap[p.id] = p.name);

        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base'
        }).select('name subscription');

        const restList = restaurants.map(r => {
            const planId = r.subscription?.planId?.toString();
            return {
                name: r.name,
                storedPlanId: planId,
                storedPlanName: r.subscription?.planName,
                mappedName: planMap[planId] || 'UNKNOWN'
            };
        });

        const result = {
            plans: planList,
            restaurants: restList
        };

        fs.writeFileSync('sub_data_debug.json', JSON.stringify(result, null, 2));
        console.log('DEBUG_DATA_WRITTEN');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkData();
