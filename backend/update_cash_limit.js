import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://manmohansahu:Manmohan%40123@cluster0.7hgzf.mongodb.net/grhapoch';

async function updateCashLimit() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const result = await mongoose.connection.db
            .collection('businesssettings')
            .updateOne({}, { $set: { deliveryCashLimit: 5000 } });

        console.log('✅ Updated cash limit to ₹5000');
        console.log('Modified count:', result.modifiedCount);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

updateCashLimit();
