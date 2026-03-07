/**
 * GRHAPOCH - TARGETED TEST CLEANUP
 * Removes order & fee trails only. Keeps:
 * - Admins, Restaurants, Delivery boys, Users
 * - Menus/Dishes/Add-ons, Coupons, Offers, Advertisements
 * - Business/Subscription settings & subscription payments
 * - All images/logos, environment vars
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

async function cleanup() {
  const answer = await ask('\n⚠️  Are you sure you want to delete order/fee data? (yes/no): ');
  if (answer.toLowerCase() !== 'yes') {
    rl.close();
    process.exit(0);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const results = {};

  const deleteAll = async (collectionName, label, filter = {}) => {
    try {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments(filter);
      if (count === 0) {
        results[label] = 0;
        return;
      }
      const res = await collection.deleteMany(filter);
      results[label] = res.deletedCount;
    } catch (err) {
      results[label] = `error: ${err.message}`;
    }
  };

  // 1) Orders and related trails
  await deleteAll('orders', 'Orders');
  await deleteAll('ordersettlements', 'Order Settlements');
  await deleteAll('orderevents', 'Order Events');
  await deleteAll('etalogs', 'ETA Logs');
  await deleteAll('deliveries', 'Delivery Records');

  // 2) Fee / commission / wallets / donations
  await deleteAll('deliverywallets', 'Delivery Wallets');
  await deleteAll('deliverywithdrawalrequests', 'Delivery Withdrawal Requests');
  await deleteAll('restaurantwallets', 'Restaurant Wallets');
  await deleteAll('withdrawalrequests', 'Restaurant Withdrawal Requests');
  await deleteAll('restaurantcommissions', 'Restaurant Commissions');
  await deleteAll('donations', 'Donations');

  // 3) OTPs & notifications (often noise in test data)
  await deleteAll('otps', 'OTPs');
  await deleteAll('notifications', 'Notifications');
  await deleteAll('restaurantnotifications', 'Restaurant Notifications');

  // Note: We DO NOT delete users (any role), restaurants, menus, ads,
  // coupons/offers, business settings, subscription plans, or subscription payments.

  console.log('\n✅ Cleanup summary:');
  for (const [key, val] of Object.entries(results)) {
    console.log(`- ${key}: ${val}`);
  }

  await mongoose.disconnect();
  rl.close();
  process.exit(0);
}

cleanup().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
