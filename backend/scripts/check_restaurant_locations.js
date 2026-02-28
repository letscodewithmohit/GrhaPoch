import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import fs from 'fs';
const LOG_FILE = path.resolve(__dirname, 'location_fix_log.txt');
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n');
};

const checkRestaurantLocations = async () => {
    try {
        if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
        log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        log('Connected to MongoDB');

        log('Checking restaurant locations...');
        const restaurants = await Restaurant.find({});

        log(`Found ${restaurants.length} restaurants.`);

        let missingLocationCount = 0;

        for (const restaurant of restaurants) {
            const hasLocation = restaurant.location &&
                (restaurant.location.latitude || (restaurant.location.coordinates && restaurant.location.coordinates[1])) &&
                (restaurant.location.longitude || (restaurant.location.coordinates && restaurant.location.coordinates[0]));

            if (!hasLocation) {
                missingLocationCount++;
                log(`❌ Restaurant missing location: ${restaurant.name} (ID: ${restaurant._id})`);
                log('Location object:');
                log(JSON.stringify(restaurant.location, null, 2));

                // Check if location exists in onboarding data
                if (restaurant.onboarding?.step1?.location) {
                    log('Found location in onboarding.step1.location:');
                    log(JSON.stringify(restaurant.onboarding.step1.location, null, 2));

                    // Attempt to fix
                    log('Attempting to fix...');
                    restaurant.location = restaurant.onboarding.step1.location;
                    if (restaurant.onboarding.step1.location.latitude && restaurant.onboarding.step1.location.longitude && !restaurant.onboarding.step1.location.coordinates) {
                        restaurant.location.coordinates = [restaurant.onboarding.step1.location.longitude, restaurant.onboarding.step1.location.latitude];
                    }
                    await restaurant.save();
                    log('✅ Fixed restaurant location.');
                } else {
                    log('⚠️ No location found in onboarding data either. Setting default location (Indore)...');
                    // Setting a default location for testing purposes (Indore center)
                    restaurant.location = {
                        latitude: 22.7196,
                        longitude: 75.8577,
                        coordinates: [75.8577, 22.7196],
                        formattedAddress: "Indore, Madhya Pradesh, India",
                        address: "Indore, Madhya Pradesh, India",
                        city: "Indore",
                        state: "Madhya Pradesh",
                        zipCode: "452001"
                    };
                    await restaurant.save();
                    log('✅ Set default location (Indore).');
                }
            } else {
                // log(`✅ Restaurant has location: ${restaurant.name}`);
            }
        }

        log(`Finished checking. Found ${missingLocationCount} restaurants with missing location.`);
        process.exit(0);
    } catch (error) {
        console.error('Error checking restaurant locations:', error); // Keep console.error for fatal errors
        log(`Error: ${error.message}`);
        process.exit(1);
    }
};

checkRestaurantLocations();
