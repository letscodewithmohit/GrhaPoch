
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../models/Restaurant.js';
import Zone from '../models/Zone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const fixLocation = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

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

        // Update the specific restaurant
        const targetId = 'REST-1771408303145-9063';
        const restaurant = await Restaurant.findOne({ restaurantId: targetId });

        if (!restaurant) {
            console.error('Restaurant not found');
            process.exit(1);
        }

        console.log(`Moving restaurant "${restaurant.name}" from [${restaurant.location?.latitude}, ${restaurant.location?.longitude}] to [${centerLat}, ${centerLng}]`);

        restaurant.location = {
            latitude: centerLat,
            longitude: centerLng,
            coordinates: [centerLng, centerLat],
            formattedAddress: `Central Location in ${activeZone.name}`,
            address: `Central Location in ${activeZone.name}`,
            city: activeZone.name,
            country: 'India'
        };

        // Update onboarding data as well
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
        restaurant.onboarding.step1.location = restaurant.location;

        await restaurant.save();
        console.log('✅ Restaurant location updated successfully to zone center.');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixLocation();
