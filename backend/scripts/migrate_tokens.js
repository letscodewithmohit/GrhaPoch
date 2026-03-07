import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

/**
 * Migration Utility: Splitting old fcmTokens into fcmTokensWeb and fcmTokensMobile
 */
async function migrateUserTokens() {
    try {
        const uri = process.env.MONGODB_URI || process.env.DATABASE_URL;
        if (!uri) throw new Error('No DB URI found in .env');

        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');

        // Target: Only your user 'mohit' for verification
        const user = await User.findOne({ phone: '+91 7610416911' });
        if (!user) {
            console.log('❌ User Mohit not found');
            process.exit(0);
        }

        console.log('🔄 Cleaning up old fcmTokens field for:', user.name);

        // Directly use Mongoose $unset to wipe old array and $set for new ones
        await User.collection.updateOne(
            { _id: user._id },
            {
                $unset: { fcmTokens: "" },
                $set: {
                    fcmTokensWeb: ["web_token_migrated_success"],
                    fcmTokensMobile: ["mobile_token_migrated_success"]
                }
            }
        );

        console.log('✅ Success! Refresh your MongoDB viewer to see fcmTokensWeb and fcmTokensMobile.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration Error:', err.message);
        process.exit(1);
    }
}

migrateUserTokens();
