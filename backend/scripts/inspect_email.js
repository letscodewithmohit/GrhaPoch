
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const inspectAbhishek = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const restaurantRaw = await Restaurant.findOne({
            $or: [
                { name: /Abhishek/i },
                { restaurantId: /3865/ }
            ]
        });

        if (!restaurantRaw) {
            console.log('Restaurant not found');
        } else {
            console.log('Restaurant found:');
            console.log(`_id: ${restaurantRaw._id}`);
            console.log(`email: '${restaurantRaw.email}'`); // Quotes to see empty string vs undefined
            console.log(`ownerEmail: '${restaurantRaw.ownerEmail}'`);
            console.log(`phone: '${restaurantRaw.phone}'`);
            console.log(`signupMethod: '${restaurantRaw.signupMethod}'`);
            console.log(`isActive: ${restaurantRaw.isActive}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

inspectAbhishek();
