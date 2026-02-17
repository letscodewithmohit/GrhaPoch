import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function checkDatabase() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all collections
        const collections = await mongoose.connection.db.listCollections().toArray();

        console.log('📊 Database Collections:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const collection of collections) {
            const count = await mongoose.connection.db.collection(collection.name).countDocuments();
            console.log(`📁 ${collection.name}: ${count} documents`);
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Check specific collections
        const restaurantCount = await mongoose.connection.db.collection('restaurants').countDocuments();
        const menuCount = await mongoose.connection.db.collection('menus').countDocuments();
        const userCount = await mongoose.connection.db.collection('users').countDocuments();
        const orderCount = await mongoose.connection.db.collection('orders').countDocuments();

        console.log('🔍 Important Collections:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🍽️  Restaurants: ${restaurantCount}`);
        console.log(`📋 Menus: ${menuCount}`);
        console.log(`👥 Users: ${userCount}`);
        console.log(`📦 Orders: ${orderCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (restaurantCount === 0) {
            console.log('⚠️  WARNING: No restaurants found!');
            console.log('💡 You need to add restaurants and menu items to see food in the app.\n');
        }

        await mongoose.disconnect();
        console.log('✅ Done! Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkDatabase();
