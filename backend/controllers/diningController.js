import Restaurant from '../models/Restaurant.js';
import DiningCategory from '../models/DiningCategory.js';
import DiningLimelight from '../models/DiningLimelight.js';
import DiningBankOffer from '../models/DiningBankOffer.js';
import DiningMustTry from '../models/DiningMustTry.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';
import DiningTable from '../models/DiningTable.js';
import DiningBooking from '../models/DiningBooking.js';
import { createOrder, verifyPayment } from '../services/razorpayService.js';

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
            _id: r._id,
            name: r.name,
            rating: r.rating || 0,
            totalRatings: r.totalRatings || 0,
            location: r.location?.city || r.zone || '',
            distance: r.distance || '1.2 km',
            cuisine: r.diningCategory || (r.cuisines && r.cuisines.length > 0 ? r.cuisines[0] : ''),
            price: r.priceRange || '$$',
            priceRange: r.priceRange || '$$',
            image: r.profileImage?.url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
            profileImage: r.profileImage || null,
            offer: r.offer || '',
            deliveryTime: r.estimatedDeliveryTime || '30-45 mins',
            deliveryTimings: r.deliveryTimings || null,
            featuredDish: r.featuredDish || '',
            featuredPrice: r.featuredPrice || 0,
            slug: r.slug,
            coordinates: r.location ? { latitude: r.location.latitude, longitude: r.location.longitude } : null,
            isPopular: r.rating >= 4,
            diningEnabled: r.diningEnabled || false,
            diningGuests: r.diningGuests || 6,
            diningSlots: r.diningSlots || { lunch: [], dinner: [] }
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
            _id: r._id,
            name: r.name,
            rating: r.rating || 0,
            totalRatings: r.totalRatings || 0,
            location: r.location?.city || r.zone || '',
            distance: r.distance || '1.2 km',
            cuisine: r.diningCategory || (r.cuisines && r.cuisines.length > 0 ? r.cuisines[0] : ''),
            price: r.priceRange || '$$',
            priceRange: r.priceRange || '$$',
            image: r.profileImage?.url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop',
            profileImage: r.profileImage || null,
            offer: r.offer || '',
            deliveryTime: r.estimatedDeliveryTime || '30-45 mins',
            deliveryTimings: r.deliveryTimings || null,
            featuredDish: r.featuredDish || '',
            featuredPrice: r.featuredPrice || 0,
            slug: r.slug,
            coordinates: r.location ? { latitude: r.location.latitude, longitude: r.location.longitude } : null,
            isPopular: r.rating >= 4,
            diningEnabled: r.diningEnabled || false,
            diningGuests: r.diningGuests || 6,
            diningSlots: r.diningSlots || { lunch: [], dinner: [] }
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
            bookingStatus: { $in: ["Pending", "Confirmed", "Completed"] }
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
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required for dining booking'
            });
        }

        // Check if already booked to prevent race condition
        const existingBooking = await DiningBooking.findOne({
            restaurantId: id,
            tableNumber,
            date,
            time,
            bookingStatus: { $in: ["Pending", "Confirmed", "Completed"] }
        });

        if (existingBooking) {
            return res.status(400).json({
                success: false,
                message: 'Table already booked for this date and time'
            });
        }

        const newBooking = new DiningBooking({
            restaurantId: id,
            userId,
            tableId,
            tableNumber,
            guests,
            date,
            time,
            guestName: customerDetails?.name || "Guest",
            guestPhone: customerDetails?.phone || "N/A",
            bookingStatus: "Pending"
        });

        await newBooking.save();

        res.status(201).json({
            success: true,
            message: "Table booking request sent successfully",
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

// Update booking status (Confirm/Reject)
export const updateBookingStatus = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status } = req.body; // "Confirmed", "Rejected", etc.

        if (!["Confirmed", "Rejected", "Completed", "Cancelled", "Pending"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking status"
            });
        }

        const booking = await DiningBooking.findByIdAndUpdate(
            bookingId,
            { bookingStatus: status },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found"
            });
        }

        res.status(200).json({
            success: true,
            message: `Booking status updated to ${status}`,
            data: booking
        });
    } catch (error) {
        console.error("Error updating booking status:", error);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: error.message
        });
    }
};

// Get the restaurant's platform fee
export const getPlatformFee = async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant = await Restaurant.findById(id);

        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found' });
        }

        const platformFee = restaurant.diningPlatformFee?.isActive ? restaurant.diningPlatformFee.amount : 0;

        res.status(200).json({
            success: true,
            data: { platformFee }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Initiate booking payment (Step 1)
export const initiateBookingPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { tableNumber, date, time } = req.body;

        // Check if table is available
        const existingBooking = await DiningBooking.findOne({
            restaurantId: id,
            tableNumber,
            date,
            time,
            bookingStatus: { $in: ["Pending", "Confirmed", "Completed"] }
        });

        if (existingBooking) {
            return res.status(400).json({
                success: false,
                message: 'Table already booked for this date and time'
            });
        }

        // Get restaurant platform fee
        const restaurant = await Restaurant.findById(id);
        if (!restaurant) {
            return res.status(404).json({ success: false, message: 'Restaurant not found' });
        }

        const platformFeeAmount = restaurant.diningPlatformFee?.isActive ? restaurant.diningPlatformFee.amount : 0;

        if (platformFeeAmount <= 0) {
            return res.status(400).json({ success: false, message: 'No platform fee configured for this restaurant' });
        }

        // Create Razorpay Order
        const orderOptions = {
            amount: platformFeeAmount * 100, // Amount in paise
            currency: "INR",
            receipt: `dpf_${id.substring(18)}_${Date.now().toString().substring(5)}`
        };

        const order = await createOrder(orderOptions);

        res.status(200).json({
            success: true,
            data: {
                orderId: order.id,
                amount: platformFeeAmount,
                currency: "INR"
            }
        });

    } catch (error) {
        console.error("Error initiating dining payment:", error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment',
            error: error.message
        });
    }
};

// Verify payment and create booking (Step 2)
export const verifyAndCreateBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id || req.user?.id;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingDetails
        } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required for dining booking'
            });
        }

        // Verify Signature
        const isValid = await verifyPayment(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Double check table availability
        const existingBooking = await DiningBooking.findOne({
            restaurantId: id,
            tableNumber: bookingDetails.tableNumber,
            date: bookingDetails.date,
            time: bookingDetails.time,
            bookingStatus: { $in: ["Pending", "Confirmed", "Completed"] }
        });

        if (existingBooking) {
            // In a real app, we would process a refund here
            return res.status(400).json({
                success: false,
                message: 'Table got booked while processing payment. Please contact support.'
            });
        }

        // Get platform fee
        const restaurant = await Restaurant.findById(id);
        const platformFeeAmount = restaurant?.diningPlatformFee?.isActive ? restaurant.diningPlatformFee.amount : 0;

        // Create Booking
        const newBooking = new DiningBooking({
            restaurantId: id,
            userId,
            tableId: bookingDetails.tableId,
            tableNumber: bookingDetails.tableNumber,
            guests: bookingDetails.guests,
            date: bookingDetails.date,
            time: bookingDetails.time,
            guestName: bookingDetails.customerDetails?.name || "Guest",
            guestPhone: bookingDetails.customerDetails?.phone || "N/A",

            // Payment fields
            diningPlatformFee: platformFeeAmount,
            paymentStatus: "Completed",
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            bookingStatus: "Confirmed" // Auto confirm since paid
        });

        await newBooking.save();

        res.status(201).json({
            success: true,
            data: newBooking
        });

    } catch (error) {
        console.error("Error verifying payment and creating booking:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get bookings for a specific restaurant
export const getRestaurantBookings = async (req, res) => {
    try {
        const { id } = req.params;
        const bookings = await DiningBooking.find({ restaurantId: id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error("Error fetching restaurant bookings:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get bookings for logged-in user
export const getUserBookings = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const bookings = await DiningBooking.find({ userId })
            .populate('restaurantId', 'name profileImage slug')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error("Error fetching user dining bookings:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

// Get all bookings (for Admin)
export const getAllBookings = async (req, res) => {
    try {
        const bookings = await DiningBooking.find()
            .populate('restaurantId', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: bookings
        });
    } catch (error) {
        console.error("Error fetching all bookings:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
