import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/database.js';
import Delivery from '../models/Delivery.js';
import { writeFileSync } from 'fs';

await connectDB();

const total = await Delivery.countDocuments({});
const online = await Delivery.countDocuments({ 'availability.isOnline': true });
const approved = await Delivery.countDocuments({ status: { $in: ['approved', 'active'] } });
const hasLocation = await Delivery.countDocuments({
    'availability.currentLocation.coordinates': { $exists: true, $ne: [0, 0] }
});
const fullyEligible = await Delivery.countDocuments({
    'availability.isOnline': true,
    status: { $in: ['approved', 'active'] },
    isActive: { $ne: false },
    'availability.currentLocation.coordinates': { $exists: true, $ne: [0, 0] }
});

const sample = await Delivery.find({}).limit(5)
    .select('name status isActive availability.isOnline availability.currentLocation')
    .lean();

const lines = [
    '',
    '========= DELIVERY PARTNER DIAGNOSTIC =========',
    `Total partners in DB        : ${total}`,
    `Online (isOnline=true)      : ${online}`,
    `Approved/Active status      : ${approved}`,
    `Has valid location (!=0,0)  : ${hasLocation}`,
    `FULLY ELIGIBLE for assign   : ${fullyEligible}  <--- Must be > 0 for assignment to work`,
    '',
    '--- Sample partners (first 5) ---',
    ...sample.map(p => {
        const coords = p.availability?.currentLocation?.coordinates;
        return `Name: ${p.name} | Status: ${p.status} | isActive: ${p.isActive} | isOnline: ${p.availability?.isOnline} | Coords: [${coords}]`;
    }),
    '================================================',
    ''
];

const output = lines.join('\n');
writeFileSync('C:/Users/manmo/delivery_diagnostic.txt', output);
process.stdout.write(output);
process.exit(0);
