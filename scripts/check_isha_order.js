import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find Restaurant
        const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }), 'restaurants');
        const restaurant = await Restaurant.findOne({ name: /isha/i });

        if (!restaurant) {
            console.log('Restaurant not found');
            process.exit(0);
        }

        console.log('Restaurant ID:', restaurant._id);
        console.log('Restaurant Name:', restaurant.name);

        // Find Latest Order for this restaurant
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }), 'orders');
        const latestOrder = await Order.findOne({ restaurantId: restaurant._id }).sort({ createdAt: -1 });

        if (!latestOrder) {
            console.log('No orders found for this restaurant');
            process.exit(0);
        }

        console.log('--- LATEST ORDER DETAILS ---');
        console.log(JSON.stringify(latestOrder, null, 2));

        // Find Delivery Boy associated with this order
        if (latestOrder.deliveryPartnerId) {
            const DeliveryPartner = mongoose.model('DeliveryPartner', new mongoose.Schema({}, { strict: false }), 'deliverypartners');
            const dp = await DeliveryPartner.findById(latestOrder.deliveryPartnerId);
            console.log('--- DELIVERY PARTNER DETAILS ---');
            console.log(JSON.stringify(dp, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkData();
