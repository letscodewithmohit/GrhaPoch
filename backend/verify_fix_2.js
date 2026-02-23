
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import fs from 'fs';

dotenv.config();

async function testQuery() {
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurantId = '6999a1c0df02e3d77a2775db'; // Isha's ID
    const restaurantIdVariations = [restaurantId];
    if (mongoose.Types.ObjectId.isValid(restaurantId)) {
        const objectIdString = new mongoose.Types.ObjectId(restaurantId).toString();
        if (!restaurantIdVariations.includes(objectIdString)) {
            restaurantIdVariations.push(objectIdString);
        }
    }

    const restaurantIdQuery = {
        $or: [
            { restaurantId: { $in: restaurantIdVariations } },
            { restaurantId: restaurantId }
        ]
    };

    const currentCycleStart = new Date('2024-01-01'); // Long ago
    const currentCycleEnd = new Date('2030-01-01'); // Future

    const buggyQuery = {
        ...restaurantIdQuery,
        status: 'delivered',
        $or: [
            { deliveredAt: { $gte: currentCycleStart, $lte: currentCycleEnd } },
            { 'tracking.delivered.timestamp': { $gte: currentCycleStart, $lte: currentCycleEnd } }
        ]
    };

    const buggyOrders = await Order.find(buggyQuery);

    const fixedQuery = {
        status: 'delivered',
        $and: [
            restaurantIdQuery,
            {
                $or: [
                    { deliveredAt: { $gte: currentCycleStart, $lte: currentCycleEnd } },
                    { 'tracking.delivered.timestamp': { $gte: currentCycleStart, $lte: currentCycleEnd } }
                ]
            }
        ]
    };

    const fixedOrders = await Order.find(fixedQuery);

    const results = `Buggy Orders count: ${buggyOrders.length}\nFixed Orders count: ${fixedOrders.length}`;
    fs.writeFileSync('fix_verification.txt', results);

    await mongoose.disconnect();
}
testQuery();
