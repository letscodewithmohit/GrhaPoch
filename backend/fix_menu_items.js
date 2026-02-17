import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function fixMenuItems() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get menu
        const menu = await mongoose.connection.db.collection('menus').findOne({});

        console.log('🔧 Fixing menu items...\n');

        // Fix each section and item
        if (menu?.sections) {
            menu.sections.forEach((section, sIndex) => {
                // Set section isActive to true if undefined
                if (section.isActive === undefined || section.isActive === null) {
                    section.isActive = true;
                }

                // Fix each item
                if (section.items && section.items.length > 0) {
                    section.items.forEach((item, iIndex) => {
                        // Set default values for undefined fields
                        if (item.isActive === undefined || item.isActive === null) {
                            item.isActive = true;
                        }
                        if (item.isAvailable === undefined || item.isAvailable === null) {
                            item.isAvailable = true;
                        }
                        if (item.isVeg === undefined || item.isVeg === null) {
                            item.isVeg = true; // Default to veg
                        }
                        if (!item.category) {
                            item.category = section.name;
                        }

                        console.log(`✅ Fixed: ${item.name} (isActive: ${item.isActive}, isAvailable: ${item.isAvailable}, isVeg: ${item.isVeg})`);
                    });
                }
            });

            // Update the menu in database
            const result = await mongoose.connection.db
                .collection('menus')
                .updateOne(
                    { _id: menu._id },
                    {
                        $set: {
                            sections: menu.sections,
                            updatedAt: new Date()
                        }
                    }
                );

            console.log('\n✅ Menu updated! Modified count:', result.modifiedCount);
        }

        // Verify the fix
        const updatedMenu = await mongoose.connection.db.collection('menus').findOne({});

        console.log('\n📊 VERIFICATION:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        updatedMenu.sections.forEach((section, sIndex) => {
            console.log(`\n📂 ${section.name} (isActive: ${section.isActive})`);

            if (section.items && section.items.length > 0) {
                section.items.forEach((item, iIndex) => {
                    console.log(`   ${iIndex + 1}. ${item.name}`);
                    console.log(`      ✓ isActive: ${item.isActive}`);
                    console.log(`      ✓ isAvailable: ${item.isAvailable}`);
                    console.log(`      ✓ isVeg: ${item.isVeg}`);
                    console.log(`      ✓ price: ₹${item.price}`);
                });
            }
        });

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        await mongoose.disconnect();
        console.log('\n✅ Done! Database connection closed.');
        console.log('🔄 Now refresh your app to see the menu items!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

fixMenuItems();
