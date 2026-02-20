
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const subscriptionPlanSchema = new mongoose.Schema({}, { strict: false });
const restaurantSchema = new mongoose.Schema({}, { strict: false });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const Restaurant = mongoose.model('Restaurant', restaurantSchema);

const inspect = async () => {
    await connectDB();

    try {
        console.log('\n--- ALL SUBSCRIPTION PLANS ---');
        const plans = await SubscriptionPlan.find();
        plans.forEach(p => {
            console.log(`ID: ${p._id}`);
            console.log(`Name: ${p.name}`);
            console.log(`Price: ${p.price}`);
            console.log(`Duration: ${p.durationMonths}`);
            console.log(`Dish Limit: ${p.dishLimit}`);
            console.log(`Is Active: ${p.isActive}`);
            console.log('---------------------------');
        });

        console.log('\n--- SUMIT\'S PIZZA ---');
        const restaurant = await Restaurant.findOne({ name: { $regex: /Sumit's Pizza/i } });
        if (restaurant) {
            console.log(`ID: ${restaurant._id}`);
            console.log(`Name: ${restaurant.name}`);
            console.log(`Business Model: ${restaurant.businessModel}`);
            console.log(`Dish Limit: ${restaurant.dishLimit} (Type: ${typeof restaurant.dishLimit})`);
            console.log(`Plan ID: ${restaurant.subscription?.planId}`);
            console.log(`Subscription Status: ${restaurant.subscription?.status}`);
        } else {
            console.log('Restaurant not found');
        }

    } catch (error) {
        console.error(error);
    } finally {
        mongoose.connection.close();
    }
};

inspect();
