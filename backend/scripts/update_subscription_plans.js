import mongoose from 'mongoose';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const updatePlans = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('Error: MONGODB_URI not found in .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Delete existing plans for a clean slate
        await SubscriptionPlan.deleteMany({});
        console.log('Cleared existing plans');

        const plans = [
            {
                name: 'Basic',
                durationMonths: 1,
                price: 999,
                description: 'Perfect for new restaurants trying out the platform',
                features: [
                    '0% Commission on all orders',
                    'Standard menu management',
                    'Standard visibility',
                    'Basic analytics',
                    'Email support'
                ],
                isActive: true,
                isPopular: false
            },
            {
                name: 'Growth',
                durationMonths: 6,
                price: 4999,
                description: 'Best for growing businesses needing more space',
                features: [
                    '0% Commission on all orders',
                    'Enhanced menu controls',
                    'Enhanced visibility',
                    'Advanced analytics',
                    'Priority email support'
                ],
                isActive: true,
                isPopular: true
            },
            {
                name: 'Premium',
                durationMonths: 12,
                price: 8999,
                description: 'Ultimate solution for established restaurants',
                features: [
                    '0% Commission on all orders',
                    'All premium menu controls',
                    'Top search visibility',
                    'Detailed insights & reports',
                    'Dedicated support manager',
                    'Marketing tools access'
                ],
                isActive: true,
                isPopular: false
            }
        ];

        await SubscriptionPlan.insertMany(plans);
        console.log('Successfully created new subscription plans:');
        plans.forEach((plan) => {
            console.log(`- ${plan.name}: INR ${plan.price} / ${plan.durationMonths} months`);
        });
    } catch (error) {
        console.error('Error updating plans:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
        process.exit(0);
    }
};

updatePlans();
