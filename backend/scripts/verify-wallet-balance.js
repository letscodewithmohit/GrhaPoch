/**
 * Verification Script: Check Delivery Wallet Balance
 * 
 * This script checks the delivery wallet to verify tips are properly included
 * 
 * Run with: node scripts/verify-wallet-balance.js
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

async function verifyWalletBalance() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all wallets
        const wallets = await DeliveryWallet.find({});

        console.log(`📊 Found ${wallets.length} delivery wallet(s)\n`);

        for (const wallet of wallets) {
            console.log('='.repeat(70));
            console.log(`💼 WALLET FOR DELIVERY: ${wallet.deliveryId}`);
            console.log('='.repeat(70));
            console.log(`💰 Total Balance: ₹${wallet.totalBalance.toFixed(2)}`);
            console.log(`💵 Total Earned: ₹${wallet.totalEarned.toFixed(2)}`);
            console.log(`💸 Cash in Hand: ₹${wallet.cashInHand.toFixed(2)}`);
            console.log(`📤 Total Withdrawn: ₹${wallet.totalWithdrawn.toFixed(2)}`);

            // Calculate breakdown by transaction type
            const breakdown = {
                payment: { count: 0, total: 0, completed: 0, pending: 0 },
                tip: { count: 0, total: 0, completed: 0, pending: 0 },
                bonus: { count: 0, total: 0, completed: 0, pending: 0 },
                withdrawal: { count: 0, total: 0, completed: 0, pending: 0 }
            };

            wallet.transactions.forEach(t => {
                if (breakdown[t.type]) {
                    breakdown[t.type].count++;
                    breakdown[t.type].total += t.amount;
                    if (t.status === 'Completed') {
                        breakdown[t.type].completed += t.amount;
                    } else if (t.status === 'Pending') {
                        breakdown[t.type].pending += t.amount;
                    }
                }
            });

            console.log('\n📋 TRANSACTION BREAKDOWN:');
            console.log('-'.repeat(70));

            Object.entries(breakdown).forEach(([type, data]) => {
                if (data.count > 0) {
                    console.log(`\n${type.toUpperCase()}:`);
                    console.log(`  Count: ${data.count}`);
                    console.log(`  Total: ₹${data.total.toFixed(2)}`);
                    console.log(`  Completed: ₹${data.completed.toFixed(2)}`);
                    console.log(`  Pending: ₹${data.pending.toFixed(2)}`);
                }
            });

            console.log('\n' + '='.repeat(70));
            console.log('📝 RECENT TRANSACTIONS (Last 5):');
            console.log('='.repeat(70));

            const recentTransactions = wallet.transactions
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5);

            recentTransactions.forEach((t, index) => {
                console.log(`\n${index + 1}. ${t.type.toUpperCase()} - ₹${t.amount.toFixed(2)}`);
                console.log(`   Status: ${t.status}`);
                console.log(`   Description: ${t.description}`);
                console.log(`   Date: ${new Date(t.createdAt).toLocaleString()}`);
            });

            console.log('\n' + '='.repeat(70) + '\n');
        }

        // Calculate expected balance
        console.log('🧮 BALANCE VERIFICATION:');
        console.log('='.repeat(70));

        for (const wallet of wallets) {
            const completedEarnings = wallet.transactions
                .filter(t => ['payment', 'tip', 'bonus', 'refund', 'earning_addon'].includes(t.type) && t.status === 'Completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const completedWithdrawals = wallet.transactions
                .filter(t => t.type === 'withdrawal' && t.status === 'Completed')
                .reduce((sum, t) => sum + t.amount, 0);

            const expectedBalance = completedEarnings - completedWithdrawals;
            const actualBalance = wallet.totalBalance;
            const difference = actualBalance - expectedBalance;

            console.log(`\nDelivery: ${wallet.deliveryId}`);
            console.log(`  Expected Balance: ₹${expectedBalance.toFixed(2)}`);
            console.log(`  Actual Balance: ₹${actualBalance.toFixed(2)}`);
            console.log(`  Difference: ₹${difference.toFixed(2)} ${difference === 0 ? '✅' : '⚠️'}`);
        }

        console.log('\n' + '='.repeat(70) + '\n');

    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the verification
verifyWalletBalance();
