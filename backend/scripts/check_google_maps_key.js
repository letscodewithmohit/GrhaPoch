import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

// Mock the encryption utils so we can read the raw values if needed
// or just use the model which should decrypt them.

import EnvironmentVariable from '../models/EnvironmentVariable.js';

async function checkEnvVars() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const envVars = await EnvironmentVariable.findOne();
        if (!envVars) {
            console.log('No EnvironmentVariable document found');
        } else {
            console.log('EnvironmentVariable document found');
            const data = envVars.toEnvObject();
            console.log('VITE_GOOGLE_MAPS_API_KEY:', data.VITE_GOOGLE_MAPS_API_KEY ? (data.VITE_GOOGLE_MAPS_API_KEY.substring(0, 10) + '...') : 'EMPTY');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkEnvVars();
