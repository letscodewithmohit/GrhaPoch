import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://grhapoch_db_user:cgoxdBiIThjVS9ca@grhapoch.tbq66wh.mongodb.net/?appName=grhapoch';

async function setupBusinessSettings() {
  try {

    await mongoose.connect(MONGO_URI);


    // Check if business settings already exist
    const existing = await mongoose.connection.db.
    collection('businesssettings').
    findOne({});

    if (existing) {



      await mongoose.connection.db.
      collection('businesssettings').
      updateOne({}, {
        $set: {
          deliveryCashLimit: 5000,
          deliveryWithdrawalLimit: 100,
          updatedAt: new Date()
        }
      });


    } else {


      await mongoose.connection.db.
      collection('businesssettings').
      insertOne({
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


    }









    await mongoose.disconnect();

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setupBusinessSettings();