
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const verify = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const targetId = 'REST-1771408303145-9063';
        const r = await Restaurant.findOne({ restaurantId: targetId });
        if (r) {
            console.log(`Restaurant: ${r.name}`);
            console.log(`Location:`, JSON.stringify(r.location, null, 2));
            console.log(`Zone active check:`);
            // Check active zones
            const zones = await mongoose.connection.collection('zones').find({ isActive: true }).toArray();
            console.log(`Active zones count: ${zones.length}`);
            if (r.location && r.location.latitude) {
                console.log('Coordinates:', r.location.latitude, r.location.longitude);
            }
        } else {
            console.log('Restaurant not found');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

verify();
