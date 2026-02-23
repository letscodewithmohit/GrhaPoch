import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (error) {
        process.exit(1);
    }
};

const getRestaurantLocation = async () => {
    await connectDB();
    try {
        const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
        const rest = await Restaurant.findOne({ name: /mohit restaurant/i }).lean();
        if (rest) {
            console.log('--- Restaurant Location ---');
            console.log(JSON.stringify(rest.location, null, 2));
            console.log('Address:', rest.address);
        } else {
            console.log('Restaurant not found');
        }
    } finally {
        mongoose.connection.close();
    }
};

getRestaurantLocation();
