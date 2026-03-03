import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/database.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import Order from '../models/Order.js';
import { writeFileSync } from 'fs';

await connectDB();

const DELIVERY_ID = '699c05a0c08573767b62495d'; // OM's ID from earlier

// Get wallet
const wallet = await DeliveryWallet.findOne({ deliveryId: DELIVERY_ID }).lean();

// Get all transactions
const transactions = wallet?.transactions || [];
const paymentTxns = transactions.filter(t => (t.type === 'payment' || t.type === 'tip') && t.status === 'Completed');

// Get week range (1 Mar - 7 Mar 2026)
const weekStart = new Date('2026-03-01T00:00:00.000+05:30');
const weekEnd = new Date('2026-03-07T23:59:59.999+05:30');

const thisWeekTxns = paymentTxns.filter(t => {
    const d = t.createdAt || t.processedAt;
    return d && new Date(d) >= weekStart && new Date(d) <= weekEnd;
});

// Get delivered orders this week
const deliveredOrders = await Order.find({
    deliveryPartnerId: DELIVERY_ID,
    status: 'delivered',
}).select('orderId status deliveredAt createdAt').lean();

const lines = [
    '========= EARNINGS DIAGNOSTIC =========',
    `Delivery Partner ID : ${DELIVERY_ID}`,
    `Wallet exists       : ${!!wallet}`,
    `Total transactions  : ${transactions.length}`,
    `Payment/tip txns    : ${paymentTxns.length}`,
    `This week txns      : ${thisWeekTxns.length}`,
    `Total delivered orders: ${deliveredOrders.length}`,
    '',
    '--- All payment/tip transactions ---',
    ...paymentTxns.slice(0, 10).map(t =>
        `  Type: ${t.type} | Amount: ₹${t.amount} | Status: ${t.status} | Date: ${t.createdAt || t.processedAt}`
    ),
    '',
    '--- Delivered orders ---',
    ...deliveredOrders.slice(0, 5).map(o =>
        `  OrderId: ${o.orderId} | Status: ${o.status} | DeliveredAt: ${o.deliveredAt}`
    ),
    '======================================='
];

const out = lines.join('\n');
writeFileSync('C:/Users/manmo/earnings_diagnostic.txt', out);
process.stdout.write(out + '\n');
process.exit(0);
