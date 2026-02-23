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

const findRestaurant = async () => {
    await connectDB();
    try {
        const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
        const res = await Restaurant.find({ name: { $regex: /Abhishek/i } }).lean();

        console.log(`Found ${res.length} restaurants:`);
        res.forEach(r => {
            console.log(JSON.stringify({
                _id: r._id,
                name: r.name,
                freeDeliveryAbove: r.freeDeliveryAbove,
                selfDelivery: r.selfDelivery
            }, null, 2));
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

findRestaurant();
