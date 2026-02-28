import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Restaurant from '../models/Restaurant.js';
import Zone from '../models/Zone.js';
// Import BusinessSettings to ensure model is registered for Restaurant pre-save hook
import BusinessSettings from '../models/BusinessSettings.js';

const fixMissingLocations = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find an active zone to get valid coordinates
        const zone = await Zone.findOne({ isActive: true });
        let validLat, validLng, zoneName;

        if (zone && zone.coordinates && zone.coordinates.length > 0) {
            // Calculate centroid for better safety (avoid boundary edge cases)
            let sumLat = 0, sumLng = 0;
            zone.coordinates.forEach(c => {
                sumLat += c.latitude || c.lat; // Handle potential schema variations just in case
                sumLng += c.longitude || c.lng;
            });
            validLat = sumLat / zone.coordinates.length;
            validLng = sumLng / zone.coordinates.length;

            zoneName = zone.name;
            console.log(`Found active zone: ${zoneName}. Using centroid coordinates: ${validLat}, ${validLng}`);
        } else {
            console.warn('⚠️ No active zone found or zone has no coordinates. Falling back to default (Indore).');
            // Default to Indore
            validLat = 22.7196;
            validLng = 75.8577;
            zoneName = 'Default (Indore)';
        }

        // 2. Find restaurants with missing location
        // Check for missing latitude or null latitude
        const query = {
            $or: [
                { 'location': { $exists: false } },
                { 'location.latitude': { $exists: false } },
                { 'location.latitude': null },
                { 'location.longitude': null }
            ]
        };

        // Also include the specific restaurant ID from the issue if it exists
        const targetId = 'REST-1771408303145-9063';

        // Find all matching restaurants
        const restaurantsWithMissingLocation = await Restaurant.find(query);
        console.log(`Found ${restaurantsWithMissingLocation.length} restaurants with missing location info.`);

        // Check specific restaurant
        const specificRestaurant = await Restaurant.findOne({ restaurantId: targetId });
        if (specificRestaurant) {
            const needsFix = !specificRestaurant.location || !specificRestaurant.location.latitude;
            if (needsFix) {
                console.log(`Target restaurant ${targetId} needs location fix.`);
                // Add to list if not already there (though find(query) should have caught it)
                if (!restaurantsWithMissingLocation.find(r => r._id.toString() === specificRestaurant._id.toString())) {
                    restaurantsWithMissingLocation.push(specificRestaurant);
                }
            } else {
                console.log(`Target restaurant ${targetId} already has location: ${specificRestaurant.location.latitude}, ${specificRestaurant.location.longitude}`);
                // Force update anyway to ensure it's in a valid zone?
                // Uncomment next line to force update the target restaurant even if it has location
                restaurantsWithMissingLocation.push(specificRestaurant);
            }
        } else {
            console.log(`Target restaurant ${targetId} not found in DB.`);
        }

        if (restaurantsWithMissingLocation.length === 0) {
            console.log('No restaurants to update.');
            process.exit(0);
        }

        // 3. Update them
        for (const restaurant of restaurantsWithMissingLocation) {
            console.log(`Updating location for: ${restaurant.name} (${restaurant.restaurantId})`);

            restaurant.location = {
                latitude: validLat,
                longitude: validLng,
                coordinates: [validLng, validLat], // GeoJSON [lng, lat]
                formattedAddress: `Default Location in ${zoneName}`,
                address: `Default Location in ${zoneName}`,
                city: zoneName,
                country: 'India'
            };

            // Also update onboarding data
            if (!restaurant.onboarding) restaurant.onboarding = {};
            if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
            restaurant.onboarding.step1.location = restaurant.location;

            try {
                await restaurant.save();
                console.log(`✅ Updated ${restaurant.name}`);
            } catch (err) {
                console.error(`❌ Failed to update ${restaurant.name}: ${err.message}`);
            }
        }

        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
};

fixMissingLocations();
