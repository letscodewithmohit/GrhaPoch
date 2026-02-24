import mongoose from 'mongoose';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import dotenv from 'dotenv';

dotenv.config();

const orderIdStr = 'ORD-1771926351724-847';

async function manualFix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const settlement = await OrderSettlement.findOne({ orderNumber: orderIdStr });
        if (!settlement) {
            console.log('Settlement not found');
            return;
        }

        // Manual data based on 4.66km
        // Rule: Base 22, Threshold 4km, Rate 5 (Assumption)
        // Actually let's use the user fee as base if it's higher
        const userFee = 23;
        const ruleBase = 22;
        const distExtra = 0.66 * 5; // 3.3
        const ruleTotal = ruleBase + distExtra; // 25.3

        const finalTotal = Math.max(userFee, ruleTotal); // 25.3
        const finalDistComm = 3.3;
        const finalBase = finalTotal - finalDistComm; // 22

        settlement.deliveryPartnerEarning = {
            basePayout: finalBase,
            distance: 4.66,
            commissionPerKm: 5,
            distanceCommission: finalDistComm,
            surgeMultiplier: 1,
            surgeAmount: 0,
            tip: 10,
            totalEarning: finalTotal + 10,
            status: 'pending'
        };

        settlement.adminEarning.deliveryMargin = userFee - finalTotal; // 23 - 25.3 = -2.3
        settlement.adminEarning.totalEarning = settlement.adminEarning.commission + settlement.adminEarning.platformFee + settlement.adminEarning.deliveryMargin;

        await settlement.save();
        console.log('Settlement fixed manually!');

        await mongoose.disconnect();
    } catch (err) {
        console.error('CRASHED:', err);
    }
}

manualFix();
