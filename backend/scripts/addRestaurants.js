import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// Models
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import { normalizePhoneNumber } from '../shared/utils/phoneUtils.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected for Adding Restaurants');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    }
};

// Sample data arrays
const restaurantNames = [
    "Spice Garden", "Tandoor Express", "Curry House", "Biryani Junction", "Masala Magic",
    "Royal Kitchen", "Flavors of India", "Desi Dhaba", "Saffron Spice", "Golden Curry",
    "Punjabi Tadka", "South Spice", "Coastal Delight", "North Star", "Mumbai Masala",
    "Delhi Darbar", "Kolkata Kitchen", "Hyderabad House", "Chennai Cafe", "Bangalore Bites",
    "Pune Palace", "Jaipur Junction", "Ahmedabad Aroma", "Surat Spice", "Vadodara Vibe",
    "Goa Grill", "Kerala Kitchen", "Tamil Tadka", "Karnataka Curry", "Andhra Aroma",
    "Rajasthani Royal", "Gujarati Ghar", "Maharashtrian Maza", "Bengali Bhoj", "Assamese Aroma",
    "Oriya Oasis", "Bihari Bites", "Uttar Pradesh Utsav", "Himachal Haveli", "Uttarakhand Utsav",
    "Punjab Palace", "Haryana House", "Delhi Dhaba", "NCR Nook", "Gurgaon Grill",
    "Noida Nook", "Faridabad Food", "Ghaziabad Grill", "Meerut Masala", "Lucknow Lounge"
];

const ownerNames = [
    "Rajesh Kumar", "Priya Sharma", "Amit Patel", "Sunita Singh", "Vikram Mehta",
    "Anjali Gupta", "Rahul Verma", "Kavita Reddy", "Suresh Iyer", "Meera Nair",
    "Deepak Joshi", "Lakshmi Menon", "Naveen Rao", "Swati Desai", "Rohit Shah",
    "Divya Agarwal", "Karan Malhotra", "Neha Kapoor", "Arjun Khanna", "Pooja Saxena",
    "Manish Tiwari", "Shruti Mishra", "Vivek Chaturvedi", "Ritu Pandey", "Ankit Dubey",
    "Sneha Trivedi", "Harsh Vora", "Kiran Bhatt", "Ravi Solanki", "Tanvi Dave",
    "Yash Parikh", "Isha Shah", "Jay Modi", "Riya Gandhi", "Kunal Shah",
    "Aisha Khan", "Zain Ali", "Fatima Sheikh", "Mohammed Ansari", "Ayesha Siddiqui",
    "Rizwan Ahmed", "Sana Khan", "Imran Sheikh", "Nida Patel", "Faisal Khan",
    "Saba Ali", "Tariq Hussain", "Amina Sheikh", "Bilal Ahmed", "Hina Khan"
];

const cuisinesList = [
    ["North Indian"], ["South Indian"], ["Chinese"], ["Pizza"], ["Burgers"],
    ["Bakery"], ["Cafe"], ["North Indian", "Chinese"], ["South Indian", "Bakery"],
    ["Pizza", "Burgers"], ["Cafe", "Bakery"], ["North Indian", "South Indian"],
    ["Chinese", "Pizza"], ["Burgers", "Cafe"], ["North Indian", "Bakery"]
];

const cities = [
    "Indore", "Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata", "Hyderabad",
    "Pune", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur",
    "Visakhapatnam", "Bhopal", "Patna", "Vadodara", "Ghaziabad", "Ludhiana"
];

const areas = [
    "MG Road", "Vijay Nagar", "Palasia", "Bhawarkua", "Scheme 54", "Rajwada",
    "Sapna Sangeeta", "Tukoganj", "Khandwa Road", "MR 10", "MR 9", "MR 8",
    "New Palasia", "Old Palasia", "Geeta Bhawan", "Navlakha", "Chhawni",
    "Sitabuldi", "Civil Lines", "Sadar Bazaar"
];

const addRestaurants = async () => {
    try {
        console.log('🚀 Starting to add 50 restaurants...\n');

        const restaurants = [];
        const passwordHash = await bcrypt.hash('Restaurant@123', 10);

        for (let i = 0; i < 50; i++) {
            const restaurantName = restaurantNames[i % restaurantNames.length] + ` ${i + 1}`;
            const ownerName = ownerNames[i % ownerNames.length];
            const basePhone = `9198765${String(i).padStart(5, '0')}`;
            const normalizedPhone = normalizePhoneNumber(basePhone);
            const email = `restaurant${i + 1}@appzeto.com`;
            const ownerEmail = `owner${i + 1}@appzeto.com`;
            const city = cities[i % cities.length];
            const area = areas[i % areas.length];
            const cuisines = cuisinesList[i % cuisinesList.length];
            
            // Generate random coordinates around Indore (22.7196, 75.8577)
            const baseLat = 22.7196;
            const baseLng = 75.8577;
            const lat = baseLat + (Math.random() - 0.5) * 0.1;
            const lng = baseLng + (Math.random() - 0.5) * 0.1;
            
            const restaurantData = {
                name: restaurantName,
                email: email,
                phone: normalizedPhone,
                phoneVerified: true,
                password: passwordHash,
                signupMethod: 'email',
                ownerName: ownerName,
                ownerEmail: ownerEmail,
                ownerPhone: normalizedPhone,
                primaryContactNumber: normalizedPhone,
                location: {
                    addressLine1: `${area}`,
                    addressLine2: `Near ${area} Market`,
                    area: area,
                    city: city,
                    state: "Madhya Pradesh",
                    pincode: `${450000 + (i % 100)}`,
                    landmark: `${area} Circle`,
                    latitude: lat,
                    longitude: lng,
                    coordinates: [lng, lat],
                    formattedAddress: `${area}, ${city}, Madhya Pradesh ${450000 + (i % 100)}`
                },
                profileImage: {
                    url: `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop&sig=${i}`
                },
                menuImages: [
                    {
                        url: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&sig=${i}1`
                    },
                    {
                        url: `https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop&sig=${i}2`
                    }
                ],
                cuisines: cuisines,
                deliveryTimings: {
                    openingTime: "09:00",
                    closingTime: "22:00"
                },
                openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
                totalRatings: Math.floor(Math.random() * 100) + 10,
                isActive: true,
                isAcceptingOrders: true,
                estimatedDeliveryTime: `${25 + (i % 15)}-${30 + (i % 15)} mins`,
                distance: `${(1 + (i % 10) * 0.3).toFixed(1)} km`,
                priceRange: ["$", "$$", "$$$", "$$$$"][i % 4],
                featuredDish: ["Butter Chicken", "Biryani", "Pizza", "Burger", "Pasta", "Dosa", "Idli"][i % 7],
                featuredPrice: [249, 299, 349, 399, 449, 499][i % 6],
                offer: ["Flat ₹50 OFF above ₹199", "Flat 20% OFF", "Buy 1 Get 1", "Flat ₹100 OFF above ₹499"][i % 4],
                onboarding: {
                    step1: {
                        restaurantName: restaurantName,
                        ownerName: ownerName,
                        ownerEmail: ownerEmail,
                        ownerPhone: normalizedPhone,
                        primaryContactNumber: normalizedPhone,
                        location: {
                            addressLine1: `${area}`,
                            addressLine2: `Near ${area} Market`,
                            area: area,
                            city: city,
                            state: "Madhya Pradesh",
                            pincode: `${450000 + (i % 100)}`,
                            landmark: `${area} Circle`,
                            latitude: lat,
                            longitude: lng,
                            coordinates: [lng, lat]
                        }
                    },
                    step2: {
                        menuImageUrls: [
                            {
                                url: `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&sig=${i}1`
                            },
                            {
                                url: `https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop&sig=${i}2`
                            }
                        ],
                        profileImageUrl: {
                            url: `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop&sig=${i}`
                        },
                        cuisines: cuisines,
                        deliveryTimings: {
                            openingTime: "09:00",
                            closingTime: "22:00"
                        },
                        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                    },
                    step3: {
                        pan: {
                            panNumber: `ABCDE${String(i).padStart(4, '0')}F`,
                            nameOnPan: ownerName,
                            image: {
                                url: `https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop&sig=${i}`
                            }
                        },
                        gst: {
                            isRegistered: i % 2 === 0,
                            gstNumber: i % 2 === 0 ? `23ABCDE${String(i).padStart(4, '0')}F1Z5` : '',
                            legalName: i % 2 === 0 ? restaurantName : '',
                            address: i % 2 === 0 ? `${area}, ${city}` : '',
                            image: i % 2 === 0 ? {
                                url: `https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop&sig=${i}gst`
                            } : null
                        },
                        fssai: {
                            registrationNumber: `1234567890${String(i).padStart(3, '0')}`,
                            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                            image: {
                                url: `https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop&sig=${i}fssai`
                            }
                        },
                        bank: {
                            accountNumber: `${String(i).padStart(12, '0')}`,
                            ifscCode: `HDFC000${String(i % 10)}`,
                            accountHolderName: ownerName,
                            accountType: ["Savings", "Current"][i % 2]
                        }
                    },
                    step4: {
                        estimatedDeliveryTime: `${25 + (i % 15)}-${30 + (i % 15)} mins`,
                        distance: `${(1 + (i % 10) * 0.3).toFixed(1)} km`,
                        priceRange: ["$", "$$", "$$$", "$$$$"][i % 4],
                        featuredDish: ["Butter Chicken", "Biryani", "Pizza", "Burger", "Pasta", "Dosa", "Idli"][i % 7],
                        featuredPrice: [249, 299, 349, 399, 449, 499][i % 6],
                        offer: ["Flat ₹50 OFF above ₹199", "Flat 20% OFF", "Buy 1 Get 1", "Flat ₹100 OFF above ₹499"][i % 4]
                    },
                    completedSteps: 4
                },
                approvedAt: new Date(),
                businessModel: "Commission Base"
            };

            restaurants.push(restaurantData);
        }

        // Insert restaurants one by one to handle any duplicates
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < restaurants.length; i++) {
            try {
                const restaurant = new Restaurant(restaurants[i]);
                await restaurant.save();
                successCount++;
                console.log(`✅ [${i + 1}/50] Added: ${restaurants[i].name}`);
            } catch (error) {
                errorCount++;
                console.error(`❌ [${i + 1}/50] Failed to add ${restaurants[i].name}:`, error.message);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   ✅ Successfully added: ${successCount} restaurants`);
        console.log(`   ❌ Failed: ${errorCount} restaurants`);
        console.log(`\n🎉 Process completed!`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding restaurants:', error);
        process.exit(1);
    }
};

// Run the script
connectDB().then(() => {
    addRestaurants();
});
