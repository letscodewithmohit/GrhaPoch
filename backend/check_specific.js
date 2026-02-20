
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Restaurant from './modules/restaurant/models/Restaurant.js';

dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const r = await Restaurant.findOne({ name: 'Manmohan Choudhary' }).select('name businessModel subscription');
        console.log('RESTAURANT_DATA:', JSON.stringify(r, null, 2));
        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
};

check();
