import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

// Delete remaining delivery record
const del1 = await db.collection('deliveries').deleteMany({})
console.log('Deliveries deleted:', del1.deletedCount)

// Delete remaining OTPs
const del2 = await db.collection('otps').deleteMany({})
console.log('OTPs deleted:', del2.deletedCount)

// Check restaurant subscriptions - these should stay (plan info)
// but we want to reset their subscription payment history
const restSubDel = await db.collection('restaurantsubscriptions').deleteMany({})
console.log('Restaurant Subscriptions (payment records) deleted:', restSubDel.deletedCount)

// Check users - especially admin
const users = await db.collection('users').find({}, { projection: { name: 1, email: 1, role: 1, phone: 1 } }).toArray()
console.log('\nAll Users remaining:')
users.forEach(u => {
    console.log(`  [${u.role}] ${u.name || u.email || u.phone || u._id}`)
})

if (users.length === 0) {
    console.log('  WARNING: No users found! Admin account may be missing.')
}

console.log('\nDone!')
await mongoose.disconnect()
process.exit(0)
