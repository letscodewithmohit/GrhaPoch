import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

const toCheck = [
    ['orders', 'Orders'],
    ['ordersettlements', 'Order Settlements'],
    ['deliveries', 'Deliveries'],
    ['deliverywallets', 'Delivery Wallets'],
    ['userwallets', 'User Wallets'],
    ['subscriptionpayments', 'Subscription Payments'],
    ['restaurantwallets', 'Restaurant Wallets'],
    ['withdrawalrequests', 'Restaurant Withdrawals'],
    ['donations', 'Donations'],
    ['otps', 'OTPs'],
    ['notifications', 'Notifications'],
]

const safe = [
    ['restaurants', 'Restaurants (SAFE)'],
    ['menus', 'Menus (SAFE)'],
    ['subscriptionplans', 'Subscription Plans (SAFE)'],
    ['businesssettings', 'Business Settings (SAFE)'],
    ['environmentvariables', 'Env Variables (SAFE)'],
    ['feesettings', 'Fee Settings (SAFE)'],
]

console.log('\n==============================')
console.log('  DATABASE STATUS AFTER CLEANUP')
console.log('==============================\n')

console.log('DELETED (should all be 0):')
for (const [col, label] of toCheck) {
    try {
        const count = await db.collection(col).countDocuments()
        const icon = count === 0 ? '  OK' : '  STILL HAS DATA'
        console.log(`${icon.padEnd(20)} ${label}: ${count}`)
    } catch {
        console.log(`  (not found)          ${label}`)
    }
}

console.log('\nSAFE DATA (should have values):')
for (const [col, label] of safe) {
    try {
        const count = await db.collection(col).countDocuments()
        const icon = count > 0 ? '  SAFE' : '  EMPTY!'
        console.log(`${icon.padEnd(20)} ${label}: ${count}`)
    } catch {
        console.log(`  (not found)          ${label}`)
    }
}

// Users by role
const users = await db.collection('users').aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
]).toArray()
console.log('\nUSERS BY ROLE:')
users.forEach(u => {
    const icon = u._id === 'admin' ? '  SAFE (admin)' : '  DELETED'
    console.log(`${icon.padEnd(20)} ${u._id}: ${u.count}`)
})

console.log('\n==============================\n')
await mongoose.disconnect()
process.exit(0)
