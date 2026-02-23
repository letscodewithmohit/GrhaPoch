import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const clearStuckOrder = async () => {
    await connectDB();
    try {
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));

        const orderId = 'ORD-1771576436381-532';
        const restaurantName = "Sumit's Pizza";

        console.log(`Checking for order: ${orderId} or restaurant: ${restaurantName}`);

        // Find by orderId
        const order = await Order.findOne({
            $or: [
                { orderId: orderId },
                { "restaurant.name": { $regex: new RegExp(restaurantName, "i") } }
            ]
        });

        if (order) {
            console.log('Found stuck order:', {
                id: order._id,
                orderId: order.orderId,
                status: order.deliveryStatus || order.status,
                restaurant: order.restaurant?.name
            });

            // Delete or Cancel the order
            const result = await Order.deleteOne({ _id: order._id });
            console.log('Order deleted:', result);
        } else {
            console.log('No order found with that ID or restaurant name.');
        }

        // Also check for any other active orders for the same restaurant name pattern
        const otherOrders = await Order.find({
            "restaurant.name": { $regex: new RegExp(restaurantName, "i") },
            status: { $in: ['accepted', 'picked_up', 'out_for_delivery', 'pending'] }
        });

        if (otherOrders.length > 0) {
            console.log(`Found ${otherOrders.length} more active orders for ${restaurantName}. Clearing them...`);
            await Order.deleteMany({
                "restaurant.name": { $regex: new RegExp(restaurantName, "i") },
                status: { $in: ['accepted', 'picked_up', 'out_for_delivery', 'pending'] }
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

clearStuckOrder();
