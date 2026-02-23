
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';
import DeliveryWallet from './modules/delivery/models/DeliveryWallet.js';

dotenv.config();

async function fixAll() {
    await mongoose.connect(process.env.MONGODB_URI);

    const wallet = await DeliveryWallet.findOne({ deliveryId: "699c05a0c08573767b62495d" });
    if (wallet) {
        wallet.totalBalance = 52;
        wallet.totalEarned = 52;
        wallet.cashInHand = 252; // 126 + 126 for the two orders

        await wallet.save();
        console.log('Final Corrected Wallet State:', {
            totalBalance: wallet.totalBalance,
            cashInHand: wallet.cashInHand,
            totalEarned: wallet.totalEarned,
            pocketBalance: wallet.totalBalance - wallet.cashInHand
        });
    }

    await mongoose.disconnect();
}
fixAll();
