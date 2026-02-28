
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../models/Restaurant.js';
import Zone from '../models/Zone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const setupAbhishek = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find the Zone Center
        const activeZone = await Zone.findOne({ isActive: true });
        if (!activeZone) {
            console.error('No active zone found!');
            process.exit(1);
        }

        console.log(`Using Zone: ${activeZone.name}`);

        // Calculate Centroid
        let sumLat = 0, sumLng = 0, count = 0;
        if (activeZone.coordinates && activeZone.coordinates.length > 0) {
            activeZone.coordinates.forEach(c => {
                sumLat += (c.latitude || c.lat);
                sumLng += (c.longitude || c.lng);
                count++;
            });
        }

        if (count === 0) {
            console.error('Zone has no coordinates');
            process.exit(1);
        }

        const centerLat = sumLat / count;
        const centerLng = sumLng / count;
        console.log(`Calculated Center: ${centerLat}, ${centerLng}`);

        // 2. Find and Update the Restaurant
        const targetId = 'REST-1771428425465-3865';
        const restaurant = await Restaurant.findOne({ restaurantId: targetId });

        if (!restaurant) {
            console.error('Restaurant not found');
            process.exit(1);
        }

        console.log(`Found Restaurant: ${restaurant.name}`);

        // Update Location
        restaurant.location = {
            ...restaurant.location, // Keep address details
            latitude: centerLat,
            longitude: centerLng,
            coordinates: [centerLng, centerLat],
        };

        // Update Onboarding location if present
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
        restaurant.onboarding.step1.location = restaurant.location;

        // Update Password
        // Note: The model's pre-save hook will hash this.
        restaurant.password = '12345678';
        console.log('Setting password to: 12345678');

        // Ensure Active
        restaurant.isActive = true;
        restaurant.isAcceptingOrders = true;

        await restaurant.save();
        console.log('✅ Restaurant setup complete: Location fixed and Password set.');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

setupAbhishek();
