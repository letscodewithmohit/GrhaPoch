/**
 * One-time script to drop legacy unique index on SubscriptionPlan.planKey
 * and ensure new compound indexes are used.
 *
 * Run: node scripts/fix_subscription_plan_indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import SubscriptionPlan from '../models/SubscriptionPlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('? MONGODB_URI not found in .env file');
  process.exit(1);
}

async function fixSubscriptionPlanIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('? Connected to MongoDB');

    const collection = mongoose.connection.db.collection('subscriptionplans');
    const indexes = await collection.indexes();

    const legacyIndex = indexes.find((idx) => idx.name === 'planKey_1');
    if (legacyIndex) {
      console.log('?? Dropping legacy unique index planKey_1...');
      await collection.dropIndex('planKey_1');
      console.log('? Dropped planKey_1');
    } else {
      console.log('?? Legacy index planKey_1 not found.');
    }

    console.log('?? Syncing SubscriptionPlan indexes...');
    await SubscriptionPlan.syncIndexes();
    console.log('? Index sync complete');
  } catch (error) {
    console.error('? Error fixing subscription plan indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('?? MongoDB connection closed');
  }
}

fixSubscriptionPlanIndexes();
