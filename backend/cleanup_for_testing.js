/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          GRHAPOCH - TEST CLEANUP SCRIPT                      ║
 * ║  Deletes test data but KEEPS: Admin, Restaurants, Menus,     ║
 * ║  Business Settings, Fee Settings, Subscription Plans,        ║
 * ║  All Images/Logos, Environment Variables                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// ─── Ask user confirmation ──────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(resolve => rl.question(q, resolve))

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env')
    process.exit(1)
}

async function cleanup() {
    console.log('\n' + '═'.repeat(60))
    console.log('  GRHAPOCH TEST DATA CLEANUP')
    console.log('═'.repeat(60))
    console.log('\n🗑️  YEH DATA DELETE HOGA:')
    console.log('   ❌ All Orders')
    console.log('   ❌ All Order Settlements')
    console.log('   ❌ All Order Events / ETA Logs')
    console.log('   ❌ All Delivery Records')
    console.log('   ❌ Delivery Boy Wallets & Withdrawal Requests')
    console.log('   ❌ User Wallets & Donations')
    console.log('   ❌ All OTPs')
    console.log('   ❌ All Notifications')
    console.log('   ❌ Subscription Payments (Gross/Sub Revenue → ₹0)')
    console.log('   ❌ Restaurant Wallets (Restaurant revenue → ₹0)')
    console.log('   ❌ Restaurant Withdrawal Requests')
    console.log('   ❌ Delivery Boy user accounts (role: delivery)')
    console.log('   ❌ Customer user accounts (role: user)')
    console.log('\n✅  YEH DATA SAFE RAHEGA:')
    console.log('   ✅ Admin account')
    console.log('   ✅ Restaurants (with all menu & images)')
    console.log('   ✅ Business Settings (logo, company name)')
    console.log('   ✅ Fee Settings & Commission Rules')
    console.log('   ✅ Subscription PLANS (just payments deleted)')
    console.log('   ✅ Environment Variables (API keys)')
    console.log('\n' + '═'.repeat(60))

    const answer = await ask('\n⚠️  Kya aap sure hain? (yes/no): ')
    if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Cleanup cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected!\n')

    const db = mongoose.connection.db
    const results = {}

    // Helper to safely delete from a collection
    const deleteAll = async (collectionName, label) => {
        try {
            const collection = db.collection(collectionName)
            const count = await collection.countDocuments()
            if (count === 0) {
                console.log(`   ⏭️  ${label}: Already empty`)
                results[label] = 0
                return
            }
            const res = await collection.deleteMany({})
            results[label] = res.deletedCount
            console.log(`   🗑️  ${label}: ${res.deletedCount} records deleted`)
        } catch (err) {
            console.log(`   ⚠️  ${label}: Skipped (${err.message})`)
            results[label] = 'error'
        }
    }

    // Helper to delete users by role only
    const deleteUsersByRole = async (roles, label) => {
        try {
            const collection = db.collection('users')
            const res = await collection.deleteMany({ role: { $in: roles } })
            results[label] = res.deletedCount
            console.log(`   🗑️  ${label}: ${res.deletedCount} records deleted`)
        } catch (err) {
            console.log(`   ⚠️  ${label}: Skipped (${err.message})`)
        }
    }

    console.log('🚀 Starting cleanup...\n')

    // ─── 1. Orders & related ──────────────────────────────────────
    console.log('📦 Orders:')
    await deleteAll('orders', 'Orders')
    await deleteAll('ordersettlements', 'Order Settlements')
    await deleteAll('orderevents', 'Order Events')
    await deleteAll('etalogs', 'ETA Logs')

    // ─── 2. Deliveries ─────────────────────────────────────────
    console.log('\n🛵 Deliveries:')
    await deleteAll('deliveries', 'Delivery Records')
    await deleteAll('deliverywallets', 'Delivery Wallets')
    await deleteAll('deliverywithdrawalrequests', 'Withdrawal Requests')

    // ─── 3. User Wallets ───────────────────────────────────────
    console.log('\n💰 Wallets:')
    await deleteAll('userwallets', 'User Wallets')
    await deleteAll('donations', 'Donations')

    // ─── 4. Auth/OTP ─────────────────────────────────────────
    console.log('\n🔐 Auth:')
    await deleteAll('otps', 'OTPs')

    // ─── 5. Notifications ─────────────────────────────────────
    console.log('\n🔔 Notifications:')
    await deleteAll('notifications', 'Notifications')
    await deleteAll('restaurantnotifications', 'Restaurant Notifications')

    // ─── 6. Subscription Payments (Gross Revenue + Sub Revenue → ₹0) ──
    console.log('\n💳 Subscription & Revenue:')
    await deleteAll('subscriptionpayments', 'Subscription Payments')
    await deleteAll('restaurantwallets', 'Restaurant Wallets')
    await deleteAll('withdrawalrequests', 'Restaurant Withdrawal Requests')
    await deleteAll('restaurantcommissions', 'Restaurant Commissions')

    // ─── 7. Users (delivery boys + customers only) ──────────
    console.log('\n👥 Users (Admin is SAFE — only delivery & customers deleted):')
    await deleteUsersByRole(['delivery'], 'Delivery Boy Accounts')
    await deleteUsersByRole(['user'], 'Customer Accounts')

    // ─── Summary ──────────────────────────────────────────────
    console.log('\n' + '═'.repeat(60))
    console.log('✅ CLEANUP COMPLETE!\n')
    console.log('📊 Summary:')
    for (const [key, val] of Object.entries(results)) {
        console.log(`   ${key}: ${val}`)
    }

    console.log('\n🎯 Ab Aap Test Kar Sakte Hain:')
    console.log('   1. Naya Customer account banao (app se register karo)')
    console.log('   2. Naya Delivery Boy banao (delivery panel se)')
    console.log('   3. Order place karo → delivery flow test karo')
    console.log('   4. Wallet, tip, commission sab fresh start se test hoga')
    console.log('\n✅ Restaurant data, menus, settings — sab safe hai!')
    console.log('═'.repeat(60) + '\n')

    await mongoose.disconnect()
    rl.close()
    process.exit(0)
}

cleanup().catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
})
