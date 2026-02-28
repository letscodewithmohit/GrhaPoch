import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

import EnvironmentVariable from '../models/EnvironmentVariable.js';

async function updateEnvVars() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        let envVars = await EnvironmentVariable.findOne();
        if (!envVars) {
            console.log('Creating new EnvironmentVariable document');
            envVars = new EnvironmentVariable({});
        }

        // Set the Google Maps API Key from the user's log
        const GOOGLE_MAPS_KEY = 'AIzaSyANVwDJt38tdG5PaVrBvg_gmh8H6xCg5-o';

        envVars.VITE_GOOGLE_MAPS_API_KEY = GOOGLE_MAPS_KEY;

        // Also ensure Razorpay keys are set if they are in .env
        if (process.env.RAZORPAY_KEY_ID) {
            envVars.RAZORPAY_API_KEY = process.env.RAZORPAY_KEY_ID;
        }
        if (process.env.RAZORPAY_KEY_SECRET) {
            envVars.RAZORPAY_SECRET_KEY = process.env.RAZORPAY_KEY_SECRET;
        }

        // Mark fields as modified to trigger encryption pre-save hook
        envVars.markModified('VITE_GOOGLE_MAPS_API_KEY');
        envVars.markModified('RAZORPAY_API_KEY');
        envVars.markModified('RAZORPAY_SECRET_KEY');

        await envVars.save();
        console.log('Environment variables updated and encrypted successfully');

        // Verify
        const updated = await EnvironmentVariable.findOne();
        const data = updated.toEnvObject();
        console.log('Verification:');
        console.log('VITE_GOOGLE_MAPS_API_KEY:', data.VITE_GOOGLE_MAPS_API_KEY ? (data.VITE_GOOGLE_MAPS_API_KEY.substring(0, 10) + '...') : 'EMPTY');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

updateEnvVars();
