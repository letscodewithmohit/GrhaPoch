import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function checkMenuItemDetails() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get menu with full details
        const menu = await mongoose.connection.db.collection('menus').findOne({});

        console.log('📋 COMPLETE MENU STRUCTURE:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(JSON.stringify(menu, null, 2));
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Detailed analysis
        if (menu?.sections) {
            console.log('📊 DETAILED ANALYSIS:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            menu.sections.forEach((section, sIndex) => {
                console.log(`\n📂 Section ${sIndex + 1}: ${section.name}`);
                console.log(`   isActive: ${section.isActive}`);
                console.log(`   Items count: ${section.items?.length || 0}`);

                if (section.items && section.items.length > 0) {
                    section.items.forEach((item, iIndex) => {
                        console.log(`\n   📦 Item ${iIndex + 1}:`);
                        console.log(`      name: ${item.name}`);
                        console.log(`      price: ₹${item.price}`);
                        console.log(`      isAvailable: ${item.isAvailable}`);
                        console.log(`      isActive: ${item.isActive}`);
                        console.log(`      isVeg: ${item.isVeg}`);
                        console.log(`      category: ${item.category}`);
                        console.log(`      image: ${item.image ? 'Yes' : 'No'}`);
                        console.log(`      description: ${item.description || 'N/A'}`);
                    });
                }
            });

            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        await mongoose.disconnect();
        console.log('\n✅ Done! Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

checkMenuItemDetails();
