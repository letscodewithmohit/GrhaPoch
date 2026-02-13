import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const resetSubscriptions = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        console.log('Resetting subscriptions for all restaurants...');

        const result = await Restaurant.updateMany({}, {
            $set: {
                'subscription': {
                    planId: null,
                    status: 'inactive',
                    startDate: null,
                    endDate: null,
                    paymentId: null,
                    orderId: null
                },
                'businessModel': 'Commission Base',
                'isActive': true // Keep them active but on commission base
            }
        });

        console.log(`Successfully reset subscriptions for ${result.modifiedCount} restaurants.`);

        process.exit(0);
    } catch (error) {
        console.error('Error resetting subscriptions:', error);
        process.exit(1);
    }
};

resetSubscriptions();
