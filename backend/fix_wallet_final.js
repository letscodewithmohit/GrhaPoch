
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import DeliveryWallet from './modules/delivery/models/DeliveryWallet.js';

dotenv.config();

async function fixAll() {
    await mongoose.connect(process.env.MONGODB_URI);

    const orderIds = ['ORD-1771837683838-780', 'ORD-1771839820929-586'];
    const orders = await Order.find({ orderId: { $in: orderIds } });

    let totalOrderAmounts = 0;
    for (const o of orders) {
        totalOrderAmounts += o.pricing.total;
        console.log(`Order ${o.orderId}: total=${o.pricing.total}`);
    }

    const wallet = await DeliveryWallet.findOne({ totalBalance: 52 });
    if (wallet) {
        console.log('Original Wallet State:', {
            totalBalance: wallet.totalBalance,
            cashInHand: wallet.cashInHand,
            totalEarned: wallet.totalEarned
        });

        // Reset totalEarned to match current balance (since we fixed transactions)
        // Actually, totalEarned should be the sum of all 'payment', 'tip', 'bonus' transactions
        const calculatedTotalEarned = wallet.transactions.reduce((acc, t) => {
            if (t.status === 'Completed' && ['payment', 'tip', 'bonus', 'earning_addon'].includes(t.type)) {
                return acc + t.amount;
            }
            return acc;
        }, 0);

        wallet.totalEarned = calculatedTotalEarned;

        // Reset cashInHand if it was inflated. 
        // Usually cashInHand = sum of totals of COD orders.
        // Let's assume the user only has these two orders as cash orders.
        // If cashInHand was 311, and these two orders were 126 and 126 (sum 252).
        // Let's see if we should set it to 252.
        // Actually, I'll just leave it or set it to 252 if it was clearly from these two.

        // wallet.cashInHand = 252; // User said "21 + 21 + 10", maybe tip is not cash?

        await wallet.save();
        console.log('Fixed Wallet State:', {
            totalBalance: wallet.totalBalance,
            cashInHand: wallet.cashInHand,
            totalEarned: wallet.totalEarned
        });
    }

    await mongoose.disconnect();
}
fixAll();
