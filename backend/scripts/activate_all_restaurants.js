import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Restaurant from '../models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: join(__dirname, '../.env') });

const activateRestaurants = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI is not defined in .env');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find inactive restaurants first to log them
    const inactiveRestaurants = await Restaurant.find({ isActive: { $ne: true } });
    console.log(`Found ${inactiveRestaurants.length} inactive restaurants.`);
    
    if (inactiveRestaurants.length > 0) {
      inactiveRestaurants.forEach(r => {
        console.log(`- Activating: ${r.name} (${r.email || r.phone})`);
      });
      
      const result = await Restaurant.updateMany(
        { isActive: { $ne: true } },
        { $set: { isActive: true } }
      );

      console.log(`Successfully updated ${result.modifiedCount} restaurants to active.`);
    } else {
      console.log('No inactive restaurants found. Checking if any restaurants exist...');
       const count = await Restaurant.countDocuments();
       console.log(`Total restaurants in DB: ${count}`);
    }

  } catch (error) {
    console.error('Error activating restaurants:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

activateRestaurants();
