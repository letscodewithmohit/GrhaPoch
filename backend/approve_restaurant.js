import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function approveRestaurant() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Approve the restaurant
        const result = await mongoose.connection.db
            .collection('restaurants')
            .updateOne(
                {},
                {
                    $set: {
                        isApproved: true,
                        isActive: true,
                        approvedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

        console.log('✅ Restaurant Approved!');
        console.log('Modified count:', result.modifiedCount);

        // Get updated restaurant
        const restaurant = await mongoose.connection.db.collection('restaurants').findOne({});

        console.log('\n🍽️  Restaurant Status:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Name:', restaurant.name);
        console.log('Slug:', restaurant.slug);
        console.log('Is Active:', restaurant.isActive ? '✅ Yes' : '❌ No');
        console.log('Is Approved:', restaurant.isApproved ? '✅ Yes' : '❌ No');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n💡 Restaurant is now visible in the app!');
        console.log('🔄 Refresh your app to see the menu items.');

        await mongoose.disconnect();
        console.log('\n✅ Done! Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

approveRestaurant();
