
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';

dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const restaurants = await Restaurant.find();
    for (const r of restaurants) {
        console.log(`Name: ${r.name} | _id: ${r._id} | RID: ${r.restaurantId}`);
    }
    await mongoose.disconnect();
}
check();
