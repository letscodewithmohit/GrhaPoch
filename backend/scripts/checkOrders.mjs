import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/database.js';
import Order from '../models/Order.js';
import { writeFileSync } from 'fs';

await connectDB();

// Get latest 5 orders
const orders = await Order.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .select('orderId status deliveryPartnerId assignmentInfo payment.method restaurantId address.location createdAt')
    .lean();

const lines = [
    '',
    '========= RECENT ORDERS DIAGNOSTIC =========',
    `Total orders checked: ${orders.length}`,
    '',
    ...orders.map((o, i) => [
        `--- Order ${i + 1} ---`,
        `  orderId          : ${o.orderId}`,
        `  status           : ${o.status}`,
        `  paymentMethod    : ${o.payment?.method}`,
        `  restaurantId     : ${o.restaurantId}`,
        `  deliveryPartner  : ${o.deliveryPartnerId || 'NOT ASSIGNED ❌'}`,
        `  assignmentInfo   : ${JSON.stringify(o.assignmentInfo)}`,
        `  customerCoords   : ${JSON.stringify(o.address?.location?.coordinates)}`,
        `  createdAt        : ${o.createdAt}`,
    ].join('\n')),
    '=============================================',
    ''
];

const output = lines.join('\n');
writeFileSync('C:/Users/manmo/orders_diagnostic.txt', output);
process.stdout.write(output);
process.exit(0);
