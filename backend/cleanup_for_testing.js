/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          GRHAPOCH - TEST CLEANUP SCRIPT                      ║
 * ║  Deletes test data but KEEPS: Admin, Restaurants, Menus,     ║
 * ║  Business Settings, Fee Settings, Subscription Plans,        ║
 * ║  All Images/Logos, Environment Variables                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// ─── Ask user confirmation ──────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

async function cleanup() {


























  const answer = await ask('\n⚠️  Kya aap sure hain? (yes/no): ');
  if (answer.toLowerCase() !== 'yes') {

    rl.close();
    process.exit(0);
  }


  await mongoose.connect(MONGODB_URI);


  const db = mongoose.connection.db;
  const results = {};

  // Helper to safely delete from a collection
  const deleteAll = async (collectionName, label) => {
    try {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      if (count === 0) {

        results[label] = 0;
        return;
      }
      const res = await collection.deleteMany({});
      results[label] = res.deletedCount;

    } catch (err) {

      results[label] = 'error';
    }
  };

  // Helper to delete users by role only
  const deleteUsersByRole = async (roles, label) => {
    try {
      const collection = db.collection('users');
      const res = await collection.deleteMany({ role: { $in: roles } });
      results[label] = res.deletedCount;

    } catch (err) {

    }
  };



  // ─── 1. Orders & related ──────────────────────────────────────

  await deleteAll('orders', 'Orders');
  await deleteAll('ordersettlements', 'Order Settlements');
  await deleteAll('orderevents', 'Order Events');
  await deleteAll('etalogs', 'ETA Logs');

  // ─── 2. Deliveries ─────────────────────────────────────────

  await deleteAll('deliveries', 'Delivery Records');
  await deleteAll('deliverywallets', 'Delivery Wallets');
  await deleteAll('deliverywithdrawalrequests', 'Withdrawal Requests');

  // ─── 3. User Wallets ───────────────────────────────────────

  await deleteAll('userwallets', 'User Wallets');
  await deleteAll('donations', 'Donations');

  // ─── 4. Auth/OTP ─────────────────────────────────────────

  await deleteAll('otps', 'OTPs');

  // ─── 5. Notifications ─────────────────────────────────────

  await deleteAll('notifications', 'Notifications');
  await deleteAll('restaurantnotifications', 'Restaurant Notifications');

  // ─── 6. Subscription Payments (Gross Revenue + Sub Revenue → ₹0) ──

  await deleteAll('subscriptionpayments', 'Subscription Payments');
  await deleteAll('restaurantwallets', 'Restaurant Wallets');
  await deleteAll('withdrawalrequests', 'Restaurant Withdrawal Requests');
  await deleteAll('restaurantcommissions', 'Restaurant Commissions');

  // ─── 7. Users (delivery boys + customers only) ──────────

  await deleteUsersByRole(['delivery'], 'Delivery Boy Accounts');
  await deleteUsersByRole(['user'], 'Customer Accounts');

  // ─── Summary ──────────────────────────────────────────────



  for (const [key, val] of Object.entries(results)) {

  }









  await mongoose.disconnect();
  rl.close();
  process.exit(0);
}

cleanup().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});