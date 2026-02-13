import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const fixTestRestaurant = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const restaurantId = '698c4b0c4a5d6d5a3a4fd0d0';
        console.log(`Finding restaurant ${restaurantId}...`);

        const restaurant = await Restaurant.findById(restaurantId);

        if (!restaurant) {
            console.log('Restaurant not found by ID, searching by name "Test Restaurant"...');
            const r = await Restaurant.findOne({ name: 'Test Restaurant' });
            if (r) {
                console.log(`Found Test Restaurant: ${r._id}`);
                await updateRestaurant(r);
            } else {
                console.log('Test Restaurant not found.');
            }
        } else {
            await updateRestaurant(restaurant);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

async function updateRestaurant(restaurant) {
    console.log(`Updating location for ${restaurant.name}...`);

    // Set to a valid location in Indore
    restaurant.location = {
        latitude: 22.7196,
        longitude: 75.8577,
        coordinates: [75.8577, 22.7196],
        formattedAddress: "Indore, Madhya Pradesh, India",
        address: "Indore, Madhya Pradesh, India",
        city: "Indore",
        state: "Madhya Pradesh",
        zipCode: "452001",
        addressLine1: "Indore Center",
        country: "India"
    };

    // Also update onboarding data to be consistent
    if (!restaurant.onboarding) restaurant.onboarding = {};
    if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
    restaurant.onboarding.step1.location = restaurant.location;

    await restaurant.save();
    console.log('✅ Updated restaurant location to Indore default.');
}

fixTestRestaurant();
