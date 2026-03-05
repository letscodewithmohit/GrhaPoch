import mongoose from 'mongoose';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { FIXED_SUBSCRIPTION_PLANS, getFixedPlanByName } from '../constants/subscriptionPlans.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const updatePlans = async () => {
    let exitCode = 0;
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const existingPlans = [];
        for (const fixedPlan of FIXED_SUBSCRIPTION_PLANS) {
            const byKey = await SubscriptionPlan.findOne({ planKey: fixedPlan.key });
            if (byKey) {
                existingPlans.push(byKey);
                continue;
            }

            const byName = await SubscriptionPlan.findOne({
                name: new RegExp(`^${fixedPlan.name}$`, 'i')
            });
            if (byName) {
                existingPlans.push(byName);
            }
        }

        if (existingPlans.length !== 3) {
            throw new Error(`Expected exactly 3 existing plans (Basic, Growth, Premium). Found: ${existingPlans.length}. No new plan was created.`);
        }

        for (const planDoc of existingPlans) {
            const fixedPlan = getFixedPlanByName(planDoc.name);
            if (!fixedPlan) continue;

            planDoc.planKey = fixedPlan.key;
            planDoc.razorpayPlanId = fixedPlan.razorpayPlanId;
            planDoc.isActive = true;
            await planDoc.save();
        }

        const updatedPlans = await SubscriptionPlan.find({
            planKey: { $in: FIXED_SUBSCRIPTION_PLANS.map((plan) => plan.key) }
        }).sort({ price: 1 }).lean();

        console.log('Successfully updated existing plans with Razorpay plan IDs:');
        updatedPlans.forEach((plan) => {
            console.log(`- ${plan.name}: ${plan.razorpayPlanId || 'MISSING'}`);
        });
    } catch (error) {
        console.error('Error updating plans:', error);
        exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
        process.exit(exitCode);
    }
};

updatePlans();
