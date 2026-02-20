
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import User from '../modules/auth/models/User.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const inspectAbhishek = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        let output = 'Connected to MongoDB\n';

        output += '\n--- Searching for Users ---\n';
        const emails = ['Abhishek@gmail.com', '712choudharymohit@gmail.com'];
        const users = await User.find({ email: { $in: emails.map(e => new RegExp(e, 'i')) } });

        if (users.length === 0) {
            output += `No users found with emails: ${emails.join(', ')}\n`;
        } else {
            users.forEach(u => {
                output += `User Found:
  ID: ${u._id}
  Name: ${u.name}
  Email: ${u.email}
  Role: ${u.role}
  Phone: ${u.phone}
  Has Password: ${!!u.password}
  Is Active: ${u.isActive}
\n`;
            });
        }

        output += '\n--- Searching for Restaurant ---\n';
        const restaurantRaw = await Restaurant.findOne({
            $or: [
                { name: /Abhishek/i },
                { restaurantId: /3865/ }
            ]
        });

        if (!restaurantRaw) {
            output += 'Restaurant not found\n';
        } else {
            output += `Restaurant Found:
  ID: ${restaurantRaw._id}
  RestaurantID: ${restaurantRaw.restaurantId}
  Name: ${restaurantRaw.name}
  Owner Email: ${restaurantRaw.ownerEmail}
  Owner Phone: ${restaurantRaw.ownerPhone}
  Location: ${JSON.stringify(restaurantRaw.location)}
  Is Active: ${restaurantRaw.isActive}
  Is Accepting Orders: ${restaurantRaw.isAcceptingOrders}
  Slug: ${restaurantRaw.slug}
\n`;
        }

        fs.writeFileSync(path.join(__dirname, 'inspect_result.txt'), output);
        console.log('Done writing to inspect_result.txt');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

inspectAbhishek();
