
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
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

// Define minimal schemas
const restaurantSchema = new mongoose.Schema({
    name: String,
    businessModel: String,
    subscription: {
        planId: String,
        status: String,
        startDate: Date,
        endDate: Date
    },
    dishLimit: Number
});

const subscriptionPlanSchema = new mongoose.Schema({
    name: String,
    price: Number,
    durationMonths: Number,
    dishLimit: Number,
    isActive: Boolean
});

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

const inspectData = async () => {
    await connectDB();

    try {
        // 1. Find Sumit's Pizza
        const restaurant = await Restaurant.findOne({ name: { $regex: /Sumit's Pizza/i } });

        if (!restaurant) {
            console.log("Restaurant 'Sumit's Pizza' not found.");
        } else {
            console.log('--- Restaurant Details ---');
            console.log(`Name: ${restaurant.name}`);
            console.log(`Business Model: ${restaurant.businessModel}`);
            console.log(`Dish Limit: ${restaurant.dishLimit}`);
            console.log(`Subscription Status: ${restaurant.subscription?.status}`);
            console.log(`Plan ID: ${restaurant.subscription?.planId}`);

            // 2. Find the Plan
            if (restaurant.subscription?.planId) {
                const plan = await SubscriptionPlan.findById(restaurant.subscription.planId);
                if (plan) {
                    console.log('\n--- Active Plan Details ---');
                    console.log(`Plan Name: ${plan.name}`);
                    console.log(`Plan Dish Limit: ${plan.dishLimit}`);
                } else {
                    console.log('\n--- Active Plan Details ---');
                    console.log('Plan not found in database!');
                }
            }
        }

        // 3. List all plans
        const allPlans = await SubscriptionPlan.find();
        console.log('\n--- All Available Plans ---');
        allPlans.forEach(p => {
            console.log(`- ${p.name}: Limit=${p.dishLimit}, ID=${p._id}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

inspectData();
