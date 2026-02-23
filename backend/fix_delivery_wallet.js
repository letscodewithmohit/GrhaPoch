
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DeliveryWallet from './modules/delivery/models/DeliveryWallet.js';
import Order from './modules/order/models/Order.js';

dotenv.config();

async function fixWallet() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find the wallet with the huge balance
        const wallet = await DeliveryWallet.findOne({ totalBalance: { $gt: 50000 } });

        if (!wallet) {
            console.log('No wallet found with balance > 50,000');
            await mongoose.disconnect();
            return;
        }

        console.log(`Found wallet for Delivery ID: ${wallet.deliveryId}, Current Balance: ${wallet.totalBalance}`);
        const originalBalance = wallet.totalBalance;
        const originalCashInHand = wallet.cashInHand;

        // 2. Find the problematic transactions (huge amounts > 1000)
        const problematicTransactions = wallet.transactions.filter(t => t.amount > 1000 && t.type === 'payment');
        const problematicOrderIds = problematicTransactions.map(t => t.orderId);

        console.log(`Found ${problematicTransactions.length} problematic transactions.`);

        // 3. Fix the transactions and the orders
        for (const tx of problematicTransactions) {
            console.log(`Fixing transaction for Order: ${tx.orderId}, current amount: ${tx.amount}`);

            // Update transaction amount to 21 (base payout)
            const oldAmount = tx.amount;
            tx.amount = 21;
            tx.description = tx.description.replace(/Distance: [0-9.]* km/, 'Distance: Fixed (COORDS_ERROR)');
            if (tx.metadata) {
                tx.metadata.distance = 0;
                tx.metadata.baseEarning = 21;
            }

            // Find the order and fix distance
            if (tx.orderId) {
                await Order.findByIdAndUpdate(tx.orderId, {
                    'assignmentInfo.distance': 0,
                    'deliveryState.routeToDelivery.distance': 0
                });
                console.log(`Fixed distance for Order ID: ${tx.orderId}`);
            }
        }

        // 4. Recalculate total balance
        // Summing up all transactions
        const newBalance = wallet.transactions.reduce((acc, t) => {
            if (t.status === 'Completed') {
                if (['payment', 'tip', 'bonus', 'credit'].includes(t.type)) {
                    return acc + t.amount;
                } else if (['withdrawal', 'deduction', 'debit'].includes(t.type)) {
                    return acc - t.amount;
                }
            }
            return acc;
        }, 0);

        wallet.totalBalance = newBalance;

        // 5. Fix cashInHand if it was also inflated by these orders
        // The user mentioned 21 + 21 + 10 = 52. 
        // If the 52 is the total expected wallet balance and there are no other transactions.

        console.log(`Calculated new balance: ${newBalance}`);

        // Save wallet
        await wallet.save();
        console.log(`Wallet updated successfully. Old Balance: ${originalBalance}, New Balance: ${wallet.totalBalance}`);

        await mongoose.disconnect();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
    }
}

fixWallet();
