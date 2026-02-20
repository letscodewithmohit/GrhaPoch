
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const checkPassword = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const email = 'Abhishek@gmail.com';
        const restaurant = await Restaurant.findOne({ email }).select('+password');

        if (!restaurant) {
            console.log('Restaurant not found!');
        } else {
            console.log(`Restaurant ID: ${restaurant._id}`);
            console.log(`Stored Password Hash: ${restaurant.password}`);

            const isMatch = await bcrypt.compare('12345678', restaurant.password);
            console.log(`Does '12345678' match? ${isMatch}`);

            if (!isMatch) {
                // Try manual re-hash
                const salt = await bcrypt.genSalt(10);
                const newHash = await bcrypt.hash('12345678', salt);
                console.log(`New Hash would be: ${newHash}`);

                // Update it manually
                restaurant.password = '12345678';
                await restaurant.save();
                console.log('Re-saved restaurant with password "12345678" via model save()');

                // Check again
                const r2 = await Restaurant.findOne({ email }).select('+password');
                const match2 = await bcrypt.compare('12345678', r2.password);
                console.log(`After re-save, does it match? ${match2}`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkPassword();
