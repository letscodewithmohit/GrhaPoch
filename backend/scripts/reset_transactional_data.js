#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const clearSubscriptionPayments = args.has('--clear-subscription-payments');
const uriArg = process.argv.find((arg) => arg.startsWith('--uri='));
const mongoUri = uriArg ? uriArg.slice('--uri='.length) : (process.env.MONGO_URI || process.env.MONGODB_URI || '');

if (!mongoUri) {
  console.error('Missing Mongo URI. Pass --uri=<mongo-uri> or set MONGO_URI in backend/.env');
  process.exit(1);
}

const collectionsToClear = [
  'orders',
  'payments',
  'ordersettlements',
  'orderevents',
  'admincommissions',
  'userwallets',
  'restaurantwallets',
  'deliverywallets',
  'adminwallets',
  'advertisements',
  'useradvertisements'
];

if (clearSubscriptionPayments) {
  collectionsToClear.push('subscriptionpayments');
}

const mustPreserve = [
  'users',
  'admins',
  'restaurants',
  'deliveries',
  'subscriptionplans',
  'restaurantcommissions',
  'deliveryboycommissions',
  'feesettings',
  'zones',
  'environmentvariables',
  'businesssettings',
  'menus',
  'offers'
];

const main = async () => {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingSet = new Set(existingCollections.map((c) => c.name));

    const presentTargets = collectionsToClear.filter((name) => existingSet.has(name));
    const missingTargets = collectionsToClear.filter((name) => !existingSet.has(name));
    const presentPreserve = mustPreserve.filter((name) => existingSet.has(name));

    console.log(`\nDB: ${dbName}`);
    console.log(`Mode: ${applyChanges ? 'APPLY (delete)' : 'DRY RUN (no delete)'}\n`);

    if (presentPreserve.length > 0) {
      console.log('Will preserve these master/config collections:');
      for (const name of presentPreserve) {
        console.log(`  - ${name}`);
      }
      console.log('');
    }

    if (presentTargets.length === 0) {
      console.log('No target transactional collections found. Nothing to do.');
      return;
    }

    const stats = [];
    for (const name of presentTargets) {
      const count = await db.collection(name).countDocuments({});
      stats.push({ name, count });
    }

    console.log('Target transactional collections:');
    for (const item of stats) {
      console.log(`  - ${item.name}: ${item.count} docs`);
    }

    if (missingTargets.length > 0) {
      console.log('\nMissing (skipped):');
      for (const name of missingTargets) {
        console.log(`  - ${name}`);
      }
    }

    if (!applyChanges) {
      console.log('\nNo data deleted (dry run).');
      console.log('Run with --apply to execute delete.');
      console.log('Example: node backend/scripts/reset_transactional_data.js --apply');
      return;
    }

    let totalDeleted = 0;
    for (const item of stats) {
      const result = await db.collection(item.name).deleteMany({});
      totalDeleted += result.deletedCount || 0;
      console.log(`Deleted ${result.deletedCount || 0} from ${item.name}`);
    }

    console.log(`\nDone. Total deleted docs: ${totalDeleted}`);
  } catch (error) {
    console.error('Reset script failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main();

