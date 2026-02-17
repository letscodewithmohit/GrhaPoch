import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function checkMenuItems() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get restaurant
        const restaurant = await mongoose.connection.db.collection('restaurants').findOne({});
        console.log('🍽️  Restaurant Found:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Name:', restaurant?.name || 'N/A');
        console.log('ID:', restaurant?._id || 'N/A');
        console.log('Slug:', restaurant?.slug || 'N/A');
        console.log('Is Active:', restaurant?.isActive);
        console.log('Is Approved:', restaurant?.isApproved);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Get menu
        const menu = await mongoose.connection.db.collection('menus').findOne({});
        console.log('📋 Menu Found:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Restaurant ID:', menu?.restaurantId || 'N/A');
        console.log('Total Sections:', menu?.sections?.length || 0);

        if (menu?.sections && menu.sections.length > 0) {
            console.log('\n📂 Menu Sections:');
            menu.sections.forEach((section, index) => {
                console.log(`\n  ${index + 1}. ${section.name}`);
                console.log(`     Items: ${section.items?.length || 0}`);

                if (section.items && section.items.length > 0) {
                    section.items.forEach((item, itemIndex) => {
                        console.log(`     ${itemIndex + 1}. ${item.name} - ₹${item.price}`);
                        console.log(`        Available: ${item.isAvailable !== false ? 'Yes' : 'No'}`);
                    });
                } else {
                    console.log('     ⚠️  No items in this section!');
                }
            });
        } else {
            console.log('⚠️  No sections found in menu!');
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Check if restaurant is active and approved
        if (!restaurant?.isActive) {
            console.log('❌ PROBLEM: Restaurant is NOT ACTIVE!');
            console.log('💡 Solution: Set isActive = true in restaurant document\n');
        }

        if (!restaurant?.isApproved) {
            console.log('❌ PROBLEM: Restaurant is NOT APPROVED!');
            console.log('💡 Solution: Set isApproved = true in restaurant document\n');
        }

        // Count total menu items
        let totalItems = 0;
        if (menu?.sections) {
            menu.sections.forEach(section => {
                totalItems += section.items?.length || 0;
            });
        }

        console.log('📊 Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Menu Items: ${totalItems}`);
        console.log(`Restaurant Active: ${restaurant?.isActive ? '✅ Yes' : '❌ No'}`);
        console.log(`Restaurant Approved: ${restaurant?.isApproved ? '✅ Yes' : '❌ No'}`);
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

checkMenuItems();
