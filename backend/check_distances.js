
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const orders = await Order.find({ 'pricing.total': 126 }).sort({ createdAt: -1 }).limit(10);

        for (const order of orders) {
            console.log(`Order ID: ${order.orderId}`);
            console.log(`Restaurant Coords: ${JSON.stringify(order.restaurantId?.location?.coordinates)}`);
            console.log(`Customer Coords: ${JSON.stringify(order.address?.location?.coordinates)}`);

            // Calculate what the distance would be using the controller logic
            let distance = 0;
            if (order.deliveryState?.routeToDelivery?.distance) {
                distance = order.deliveryState.routeToDelivery.distance;
                console.log(`  Distance from routeToDelivery: ${distance}`);
            } else if (order.assignmentInfo?.distance) {
                distance = order.assignmentInfo.distance;
                console.log(`  Distance from assignmentInfo: ${distance}`);
            } else if (order.restaurantId?.location?.coordinates && order.address?.location?.coordinates) {
                const [rLng, rLat] = order.restaurantId.location.coordinates;
                const [cLng, cLat] = order.address.location.coordinates;

                const R = 6371; // Earth radius in km
                const dLat = (cLat - rLat) * Math.PI / 180;
                const dLng = (cLng - rLng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(rLat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                distance = R * c;
                console.log(`  Calculated Haversine Distance: ${distance}`);
            }

            console.log(`Final Distance used: ${distance}`);
            console.log('---');
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}
check();
