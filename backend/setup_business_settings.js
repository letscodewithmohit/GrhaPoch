import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function setupBusinessSettings() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Check if business settings already exist
        const existing = await mongoose.connection.db
            .collection('businesssettings')
            .findOne({});

        if (existing) {
            console.log('⚠️  Business settings already exist');
            console.log('🔄 Updating delivery cash limit to ₹5000...');

            await mongoose.connection.db
                .collection('businesssettings')
                .updateOne({}, {
                    $set: {
                        deliveryCashLimit: 5000,
                        deliveryWithdrawalLimit: 100,
                        updatedAt: new Date()
                    }
                });

            console.log('✅ Business settings updated!');
        } else {
            console.log('🔄 Creating business settings...');

            await mongoose.connection.db
                .collection('businesssettings')
                .insertOne({
                    companyName: 'Grha Poch',
                    primaryColor: '#0ea5e9', // Sky blue
                    deliveryCashLimit: 5000,
                    deliveryWithdrawalLimit: 100,
                    platformFee: 5,
                    taxRate: 5,
                    deliveryRadius: 10,
                    minOrderAmount: 50,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

            console.log('✅ Business settings created!');
        }

        console.log('\n📋 Business Settings:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🏢 Company: Grha Poch');
        console.log('💰 Delivery Cash Limit: ₹5000');
        console.log('💸 Withdrawal Limit: ₹100');
        console.log('🎨 Primary Color: Sky Blue (#0ea5e9)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        await mongoose.disconnect();
        console.log('\n✅ Done! Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

setupBusinessSettings();
