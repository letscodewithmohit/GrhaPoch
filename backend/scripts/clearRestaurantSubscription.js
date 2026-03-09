/**
 * Clears subscription data for ONE restaurant so the UI stops showing "Active Plan".
 * Run from backend folder: node scripts/clearRestaurantSubscription.js <restaurantId|email|phone>
 * Example: node scripts/clearRestaurantSubscription.js 507f1f77bcf86cd799439011
 * Example: node scripts/clearRestaurantSubscription.js myrestaurant@example.com
 * Example: node scripts/clearRestaurantSubscription.js 919691967116
 *
 * Does not touch other collections or other restaurants. No effect on other code.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Restaurant from '../models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

/** Normalize phone to digits only for matching */
const phoneDigits = (p) => (p && String(p).replace(/\D/g, '')) || '';

const clearRestaurantSubscription = async () => {
  const arg = process.argv[2];
  if (!arg || !arg.trim()) {
    console.error('Usage: node scripts/clearRestaurantSubscription.js <restaurantId|email|phone>');
    process.exit(1);
  }

  await connectDB();

  try {
    const idOrEmailOrPhone = arg.trim();
    const isEmail = idOrEmailOrPhone.includes('@');
    const isPhone = /^\d+$/.test(idOrEmailOrPhone.replace(/\D/g, ''));

    let query = null;
    if (isEmail) {
      query = { email: idOrEmailOrPhone };
    } else if (isPhone) {
      const digits = idOrEmailOrPhone.replace(/\D/g, '');
      query = {
        $or: [
          { phone: digits },
          { phone: `91${digits}` },
          { phone: `+${digits}` },
          { ownerPhone: digits },
          { ownerPhone: `91${digits}` }
        ]
      };
    } else if (mongoose.Types.ObjectId.isValid(idOrEmailOrPhone)) {
      query = { _id: new mongoose.Types.ObjectId(idOrEmailOrPhone) };
    }

    if (!query) {
      console.error('Invalid restaurant ID, email or phone.');
      process.exit(1);
    }

    const restaurant = await Restaurant.findOne(query).select('name email _id subscription businessModel').lean();
    if (!restaurant) {
      console.error('Restaurant not found for:', idOrEmail);
      process.exit(1);
    }

    const result = await Restaurant.updateOne(
      { _id: restaurant._id },
      {
        $unset: { subscription: '', subscriptionHistory: '' },
        $set: { businessModel: 'Commission Base' }
      }
    );

    if (result.modifiedCount === 1) {
      console.log('Done. Subscription cleared for:', restaurant.name || restaurant.email);
      console.log('Refresh the Subscription Plans page — it should no longer show Active Plan.');
    } else {
      console.log('No change (document may already have no subscription).');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

clearRestaurantSubscription();
