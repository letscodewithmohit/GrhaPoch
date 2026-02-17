import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function fixMenuRestaurantLink() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get restaurant
        const restaurant = await mongoose.connection.db.collection('restaurants').findOne({});
        console.log('🍽️  Restaurant:');
        console.log('Name:', restaurant.name);
        console.log('ID:', restaurant._id.toString());
        console.log('Restaurant ID (custom):', restaurant.restaurantId);
        console.log('Slug:', restaurant.slug);
        console.log('\n');

        // Get menu
        const menu = await mongoose.connection.db.collection('menus').findOne({});
        console.log('📋 Menu:');
        console.log('Menu ID:', menu._id.toString());
        console.log('Restaurant ID in menu:', menu.restaurantId);
        console.log('Sections:', menu.sections?.length || 0);
        console.log('\n');

        // Check if restaurantId matches
        const restaurantIdStr = restaurant._id.toString();
        const menuRestaurantId = menu.restaurantId?.toString();

        if (menuRestaurantId !== restaurantIdStr && menuRestaurantId !== restaurant.restaurantId) {
            console.log('❌ PROBLEM: Menu restaurantId does not match!');
            console.log('Restaurant _id:', restaurantIdStr);
            console.log('Restaurant.restaurantId:', restaurant.restaurantId);
            console.log('Menu.restaurantId:', menuRestaurantId);
            console.log('\n🔄 Fixing menu restaurantId...\n');

            // Update menu to link to restaurant
            const result = await mongoose.connection.db
                .collection('menus')
                .updateOne(
                    { _id: menu._id },
                    {
                        $set: {
                            restaurantId: restaurant.restaurantId || restaurantIdStr,
                            updatedAt: new Date()
                        }
                    }
                );

            console.log('✅ Menu updated! Modified count:', result.modifiedCount);
        } else {
            console.log('✅ Menu is correctly linked to restaurant');
        }

        // Verify the fix
        const updatedMenu = await mongoose.connection.db.collection('menus').findOne({});
        console.log('\n📊 Final Status:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Restaurant ID:', restaurant.restaurantId || restaurant._id.toString());
        console.log('Menu Restaurant ID:', updatedMenu.restaurantId);
        console.log('Match:', (updatedMenu.restaurantId === (restaurant.restaurantId || restaurant._id.toString())) ? '✅ Yes' : '❌ No');
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

fixMenuRestaurantLink();
