
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DeliveryBoyCommission from './modules/admin/models/DeliveryBoyCommission.js';
import fs from 'fs';

dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const rules = await DeliveryBoyCommission.find();
        fs.writeFileSync('commission_rules.json', JSON.stringify(rules, null, 2));
        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}
check();
