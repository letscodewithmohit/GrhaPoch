
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

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
    const currentCycleEnd = new Date('2026-01-01'); // Future

    // BUGGY WAY
    const buggyQuery = {
        ...restaurantIdQuery,
        status: 'delivered',
        $or: [
            { deliveredAt: { $gte: currentCycleStart, $lte: currentCycleEnd } },
            { 'tracking.delivered.timestamp': { $gte: currentCycleStart, $lte: currentCycleEnd } }
        ]
    };

    console.log('Buggy Query Keys:', Object.keys(buggyQuery));
    const buggyOrders = await Order.find(buggyQuery);
    console.log(`Buggy Orders found for Isha: ${buggyOrders.length}`);

    // FIXED WAY
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

    console.log('Fixed Query Keys:', Object.keys(fixedQuery));
    const fixedOrders = await Order.find(fixedQuery);
    console.log(`Fixed Orders found for Isha: ${fixedOrders.length}`);

    await mongoose.disconnect();
}
testQuery();


// jesa ki mere app mai do modal hai commision based or subscription based toh yeh do resturant mai none kyon dikha raha hai bussiness model mai or mere comssion or subscription model mai koi dikkat hai kya frontend mai backend mai or database or updation mai ??? resturant registration ke time pr busines model selct hota hai or in dono mai bhi pagonation lgana hai ky ?