
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import fs from 'fs';

dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const restaurants = await Restaurant.find();
    let out = "";
    for (const r of restaurants) {
        out += `Name: ${r.name} | _id: ${r._id} | RID: ${r.restaurantId}\n`;
    }
    fs.writeFileSync('restaurants_list.txt', out, 'utf8');
    await mongoose.disconnect();
}
check();
