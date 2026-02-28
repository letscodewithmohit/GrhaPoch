/**
 * Migration Script: Fix Pending Tips
 * 
 * This script updates all pending tip transactions to 'Completed' status
 * and recalculates wallet balances accordingly.
 * 
 * Run with: node scripts/fix-pending-tips.js
 */

import mongoose from 'mongoose';
import DeliveryWallet from '../models/DeliveryWallet.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables');
    process.exit(1);
}

async function fixPendingTips() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all wallets with pending tip transactions
        const wallets = await DeliveryWallet.find({
            'transactions.type': 'tip',
            'transactions.status': 'Pending'
        });

        console.log(`\n📊 Found ${wallets.length} wallets with pending tips\n`);

        let totalTipsFixed = 0;
        let totalAmountAdded = 0;

        for (const wallet of wallets) {
            console.log(`\n💼 Processing wallet for delivery: ${wallet.deliveryId}`);
            console.log(`   Current balance: ₹${wallet.totalBalance}`);

            let walletUpdated = false;
            let tipsInThisWallet = 0;
            let amountInThisWallet = 0;

            // Find all pending tip transactions
            wallet.transactions.forEach((transaction) => {
                if (transaction.type === 'tip' && transaction.status === 'Pending') {
                    console.log(`   📝 Found pending tip: ₹${transaction.amount} (${transaction.description})`);

                    // Update status to Completed
                    transaction.status = 'Completed';

                    // Update wallet balances (same logic as addTransaction)
                    wallet.totalBalance += transaction.amount;
                    wallet.totalEarned += transaction.amount;

                    tipsInThisWallet++;
                    amountInThisWallet += transaction.amount;
                    walletUpdated = true;
                }
            });

            if (walletUpdated) {
                await wallet.save();
                console.log(`   ✅ Updated ${tipsInThisWallet} tips, added ₹${amountInThisWallet.toFixed(2)} to balance`);
                console.log(`   💰 New balance: ₹${wallet.totalBalance}`);

                totalTipsFixed += tipsInThisWallet;
                totalAmountAdded += amountInThisWallet;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📊 Total wallets processed: ${wallets.length}`);
        console.log(`💰 Total tips fixed: ${totalTipsFixed}`);
        console.log(`💵 Total amount added to balances: ₹${totalAmountAdded.toFixed(2)}`);
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Error during migration:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the migration
fixPendingTips();
