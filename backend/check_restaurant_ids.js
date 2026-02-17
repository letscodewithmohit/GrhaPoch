import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function checkRestaurantIds() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get restaurant
        const restaurant = await mongoose.connection.db.collection('restaurants').findOne({});

        console.log('🍽️  RESTAURANT IDs:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('_id (MongoDB):', restaurant._id.toString());
        console.log('restaurantId (custom):', restaurant.restaurantId);
        console.log('slug:', restaurant.slug);
        console.log('name:', restaurant.name);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('💡 FRONTEND SHOULD USE:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('restaurantId:', restaurant.restaurantId || restaurant._id.toString());
        console.log('restaurantName:', restaurant.name);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Check if restaurant has required fields
        console.log('📋 RESTAURANT VALIDATION:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Has location:', !!restaurant.location);
        console.log('Has address:', !!restaurant.address);
        console.log('Is Active:', restaurant.isActive);
        console.log('Is Approved:', restaurant.isApproved);
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

checkRestaurantIds();
