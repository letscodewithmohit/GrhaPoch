
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DeliveryWallet from './modules/delivery/models/DeliveryWallet.js';
import fs from 'fs';

dotenv.config();

async function debug() {
    await mongoose.connect(process.env.MONGODB_URI);
    const wallet = await DeliveryWallet.findOne({ totalBalance: 52 });
    if (wallet) {
        fs.writeFileSync('wallet_debug.json', JSON.stringify(wallet, null, 2));
        console.log('Wallet saved to wallet_debug.json');
    } else {
        console.log('Wallet not found');
    }
    await mongoose.disconnect();
}
debug();
