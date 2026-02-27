import Restaurant from '../../restaurant/models/Restaurant.js';
import DiningCategory from '../models/DiningCategory.js';
import DiningLimelight from '../models/DiningLimelight.js';
import DiningBankOffer from '../models/DiningBankOffer.js';
import DiningMustTry from '../models/DiningMustTry.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';
import DiningTable from '../models/DiningTable.js';
import DiningBooking from '../models/DiningBooking.js';

// Get all dining restaurants (with filtering)
export const getRestaurants = async (req, res) => {
    try {
        const { city } = req.query;
        let query = { diningEnabled: true };

        // Simple filter support
        if (city) {
            query.$or = [
                { 'location.city': { $regex: city, $options: 'i' } },
                { 'location.area': { $regex: city, $options: 'i' } },
                { 'zone': { $regex: city, $options: 'i' } },
                { 'location.city': { $exists: false } },
                { 'location.city': '' },
                { 'location.city': null },
                { location: { $exists: false } },
                { location: null }
            ];
        }

        const rawRestaurants = await Restaurant.find(query);
        const restaurants = rawRestaurants.map(r => ({
            id: r._id,
            name: r.name,
            rating: r.rating || 0,
            location: r.location?.city || r.zone || '',
            distance: r.distance || '1.2 km',
            cuisine: r.diningCategory || (r.cuisines && r.cuisines.length > 0 ? r.cuisines[0] : ''),
            price: r.priceRange || '$$',
            image: r.profileImage?.url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
            offer: r.offer || '',
            deliveryTime: r.estimatedDeliveryTime || '30-45 mins',
            featuredDish: r.featuredDish || '',
            featuredPrice: r.featuredPrice || 0,
            slug: r.slug,
            coordinates: r.location ? { latitude: r.location.latitude, longitude: r.location.longitude } : null,
            isPopular: r.rating >= 4
        }));

        res.status(200).json({
            success: true,
            count: restaurants.length,
            data: restaurants
        });
    } catch (error) {
        console.error("Error fetching dining enabled restaurants:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get single restaurant by slug
export const getRestaurantBySlug = async (req, res) => {
    try {
        const r = await Restaurant.findOne({ slug: req.params.slug, diningEnabled: true });

        if (!r) {
            return res.status(404).json({
                success: false,
                message: 'Restaurant not found'
            });
        }

        const mappedRestaurant = {
            id: r._id,
            name: r.name,
            rating: r.rating || 0,
            location: r.location?.city || r.zone || '',
            distance: r.distance || '1.2 km',
            cuisine: r.diningCategory || (r.cuisines && r.cuisines.length > 0 ? r.cuisines[0] : ''),
            price: r.priceRange || '$$',
            image: r.profileImage?.url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
            offer: r.offer || '',
            deliveryTime: r.estimatedDeliveryTime || '30-45 mins',
            featuredDish: r.featuredDish || '',
            featuredPrice: r.featuredPrice || 0,
            slug: r.slug,
            coordinates: r.location ? { latitude: r.location.latitude, longitude: r.location.longitude } : null,
            isPopular: r.rating >= 4
        };

        res.status(200).json({
            success: true,
            data: mappedRestaurant
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get dining categories
export const getCategories = async (req, res) => {
    try {
        const categories = await DiningCategory.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get limelight features
export const getLimelight = async (req, res) => {
    try {
        const limelights = await DiningLimelight.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: limelights.length,
            data: limelights
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get bank offers
export const getBankOffers = async (req, res) => {
    try {
        const offers = await DiningBankOffer.find({ isActive: true });
        res.status(200).json({
            success: true,
            count: offers.length,
            data: offers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get must tries
export const getMustTries = async (req, res) => {
    try {
        const mustTries = await DiningMustTry.find({ isActive: true }).sort({ order: 1 });
        res.status(200).json({
            success: true,
            count: mustTries.length,
            data: mustTries
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get offer banners
export const getOfferBanners = async (req, res) => {
    try {
        const banners = await DiningOfferBanner.find({ isActive: true }).populate('restaurant', 'name').sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: banners.length,
            data: banners
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get dining stories
export const getStories = async (req, res) => {
    try {
        const stories = await DiningStory.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: stories.length,
            data: stories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get available tables for a restaurant with booking logic
export const getAvailableTables = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, time, guests } = req.query;

        // Find active tables
        const tables = await DiningTable.find({
            restaurantId: id,
            status: "Active"
        }).sort({ capacity: 1 });

        // Find existing bookings for this restaurant on the requested date and time
        const existingBookings = await DiningBooking.find({
            restaurantId: id,
            date,
            time,
            status: { $in: ["Pending", "Confirmed"] }
        });

        const bookedTableNumbers = existingBookings.map(b => b.tableNumber);

        // Map tables and mark if booked or unavailable
        const result = tables.map(table => ({
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            isAvailable: !bookedTableNumbers.includes(table.tableNumber),
            isCapacityMatch: guests ? table.capacity >= Number(guests) : true
        }));

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Create a new booking
export const createBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { tableId, tableNumber, guests, date, time, customerDetails } = req.body;

        // Check if already booked to prevent race condition
        const existingBooking = await DiningBooking.findOne({
            restaurantId: id,
            tableNumber,
            date,
            time,
            status: { $in: ["Pending", "Confirmed"] }
        });

        if (existingBooking) {
            return res.status(400).json({
                success: false,
                message: 'Table already booked for this date and time'
            });
        }

        const newBooking = new DiningBooking({
            restaurantId: id,
            tableId,
            tableNumber,
            guests,
            date,
            time,
            guestName: customerDetails?.name || "Guest",
            guestPhone: customerDetails?.phone || "N/A"
        });

        await newBooking.save();

        res.status(201).json({
            success: true,
            data: newBooking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
