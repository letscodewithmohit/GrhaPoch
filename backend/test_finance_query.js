
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

    console.log('Query:', JSON.stringify(restaurantIdQuery, null, 2));

    const orders = await Order.find({
        ...restaurantIdQuery,
        status: 'delivered'
    });

    console.log(`Orders found for Isha's ID: ${orders.length}`);
    for (const o of orders) {
        console.log(`OrderID: ${o.orderId} | RID: ${o.restaurantId} | RName: ${o.restaurantName}`);
    }

    // Also check if any order has restaurantId pointing to Abhi's ID but somehow matches Isha's name? No, query is on restaurantId.

    await mongoose.disconnect();
}
testQuery();
