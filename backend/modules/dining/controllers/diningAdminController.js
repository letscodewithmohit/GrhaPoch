import DiningCategory from '../models/DiningCategory.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';
import DiningBooking from '../models/DiningBooking.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { cloudinary } from '../../../config/cloudinary.js';

const DINING_STATUSES = {
    REQUESTED: 'Requested',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PAYMENT_PENDING: 'Payment Pending',
    PAYMENT_SUCCESSFUL: 'Payment Successful'
};

const getEffectiveDiningStatus = (restaurant) => {
    if (!restaurant) return null;
    if (restaurant.diningStatus) return restaurant.diningStatus;
    if (restaurant.diningRequested) return DINING_STATUSES.REQUESTED;
    if (restaurant.diningEnabled) return DINING_STATUSES.PAYMENT_SUCCESSFUL;
    return null;
};

const getAdminDiningStatusLabel = (restaurant) => {
    const status = getEffectiveDiningStatus(restaurant);
    if (restaurant?.diningEnabled) return 'Dining Enabled';
    if (status === DINING_STATUSES.REQUESTED) return 'Pending Approval';
    return status || 'Not Requested';
};

// ==================== DINING CATEGORIES ====================

export const getAdminDiningCategories = async (req, res) => {
    try {
        const categories = await DiningCategory.find().sort({ createdAt: -1 }).lean();
        return successResponse(res, 200, 'Categories retrieved successfully', { categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return errorResponse(res, 500, 'Failed to fetch categories');
    }
};

export const createDiningCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/categories',
            resource_type: 'image'
        });

        const category = new DiningCategory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id
        });

        await category.save();

        return successResponse(res, 201, 'Category created successfully', { category });
    } catch (error) {
        console.error('Error creating category:', error);
        return errorResponse(res, 500, 'Failed to create category');
    }
};

export const deleteDiningCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await DiningCategory.findById(id);
        if (!category) return errorResponse(res, 404, 'Category not found');

        try {
            await cloudinary.uploader.destroy(category.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningCategory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Category deleted successfully');
    } catch (error) {
        console.error('Error deleting category:', error);
        return errorResponse(res, 500, 'Failed to delete category');
    }
};

// ==================== DINING OFFER BANNERS ====================

export const getAdminDiningOfferBanners = async (req, res) => {
    try {
        const banners = await DiningOfferBanner.find()
            .populate('restaurant', 'name')
            .sort({ createdAt: -1 })
            .lean();
        return successResponse(res, 200, 'Banners retrieved successfully', { banners });
    } catch (error) {
        console.error('Error fetching banners:', error);
        return errorResponse(res, 500, 'Failed to fetch banners');
    }
};

export const createDiningOfferBanner = async (req, res) => {
    try {
        const { percentageOff, tagline, restaurant } = req.body;
        if (!percentageOff || !tagline || !restaurant) {
            return errorResponse(res, 400, 'All fields are required');
        }
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/offers',
            resource_type: 'image'
        });

        const banner = new DiningOfferBanner({
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id,
            percentageOff,
            tagline,
            restaurant
        });

        await banner.save();

        // Populate restaurant details for immediate display
        await banner.populate('restaurant', 'name');

        return successResponse(res, 201, 'Banner created successfully', { banner });
    } catch (error) {
        console.error('Error creating banner:', error);
        return errorResponse(res, 500, 'Failed to create banner');
    }
};

export const deleteDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        try {
            await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningOfferBanner.findByIdAndDelete(id);
        return successResponse(res, 200, 'Banner deleted successfully');
    } catch (error) {
        console.error('Error deleting banner:', error);
        return errorResponse(res, 500, 'Failed to delete banner');
    }
};

export const updateDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { percentageOff, tagline, restaurant } = req.body;

        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        if (percentageOff) banner.percentageOff = percentageOff;
        if (tagline) banner.tagline = tagline;
        if (restaurant) banner.restaurant = restaurant;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/offers',
                resource_type: 'image'
            });

            banner.imageUrl = result.secure_url;
            banner.cloudinaryPublicId = result.public_id;
        }

        await banner.save();
        await banner.populate('restaurant', 'name');

        return successResponse(res, 200, 'Banner updated successfully', { banner });
    } catch (error) {
        console.error('Error updating banner:', error);
        return errorResponse(res, 500, 'Failed to update banner');
    }
};

export const getActiveRestaurants = async (req, res) => {
    try {
        // Fetch restaurants that are active (assuming isServiceable or similar flag, or just all)
        // For now fetching all with just name and id
        const restaurants = await Restaurant.find().select('name _id').lean();
        return successResponse(res, 200, 'Restaurants retrieved successfully', { restaurants });
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        return errorResponse(res, 500, 'Failed to fetch restaurants');
    }
}

export const updateDiningSettings = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { diningEnabled, guests, cuisine } = req.body;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

        if (diningEnabled !== undefined) {
            const nextValue = Boolean(diningEnabled);

            if (nextValue === true) {
                return errorResponse(res, 400, 'Direct dining enable is disabled. Use request approval flow.');
            }

            restaurant.diningEnabled = false;
        }
        if (guests !== undefined) restaurant.diningGuests = guests;
        if (cuisine !== undefined) restaurant.diningCategory = cuisine;

        await restaurant.save();

        return successResponse(res, 200, 'Dining settings updated successfully', { restaurant });
    } catch (error) {
        console.error('Error updating dining settings:', error);
        return errorResponse(res, 500, 'Failed to update dining settings');
    }
};

// ==================== DINING REQUEST APPROVAL FLOW ====================

export const getDiningRequests = async (req, res) => {
    try {
        const restaurants = await Restaurant.find({
            $or: [
                { diningRequested: true },
                { diningStatus: { $in: Object.values(DINING_STATUSES) } },
                { diningEnabled: true }
            ]
        })
            .select('name ownerName ownerEmail businessModel diningRequested diningStatus diningRequestDate diningEnabled diningActivationPaid diningActivationAmount diningActivationDate createdAt')
            .sort({ diningRequestDate: -1, updatedAt: -1 })
            .lean();

        const requests = restaurants.map((restaurant) => ({
            restaurantId: restaurant._id,
            restaurantName: restaurant.name || '',
            ownerName: restaurant.ownerName || '',
            ownerEmail: restaurant.ownerEmail || '',
            businessModel: restaurant.businessModel || 'None',
            requestDate: restaurant.diningRequestDate || restaurant.createdAt,
            diningRequested: Boolean(restaurant.diningRequested),
            diningEnabled: Boolean(restaurant.diningEnabled),
            diningActivationPaid: Boolean(restaurant.diningActivationPaid),
            diningActivationAmount: Number(restaurant.diningActivationAmount) || 0,
            diningActivationDate: restaurant.diningActivationDate || null,
            diningStatus: getEffectiveDiningStatus(restaurant),
            statusLabel: getAdminDiningStatusLabel(restaurant)
        }));

        return successResponse(res, 200, 'Dining requests retrieved successfully', { requests });
    } catch (error) {
        console.error('Error fetching dining requests:', error);
        return errorResponse(res, 500, 'Failed to fetch dining requests');
    }
};

export const approveDiningRequest = async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

        if (restaurant.diningEnabled) {
            return successResponse(res, 200, 'Dining is already enabled for this restaurant', {
                restaurantId: restaurant._id,
                diningStatus: getEffectiveDiningStatus(restaurant),
                statusLabel: getAdminDiningStatusLabel(restaurant)
            });
        }

        const currentStatus = getEffectiveDiningStatus(restaurant);
        if (!restaurant.diningRequested && !currentStatus) {
            return errorResponse(res, 400, 'This restaurant has not requested dining enable yet');
        }

        restaurant.diningRequested = true;
        if (!restaurant.diningRequestDate) {
            restaurant.diningRequestDate = new Date();
        }
        restaurant.diningStatus = DINING_STATUSES.APPROVED;
        await restaurant.save();

        return successResponse(res, 200, 'Dining request approved successfully', {
            restaurantId: restaurant._id,
            diningStatus: restaurant.diningStatus,
            statusLabel: getAdminDiningStatusLabel(restaurant)
        });
    } catch (error) {
        console.error('Error approving dining request:', error);
        return errorResponse(res, 500, 'Failed to approve dining request');
    }
};

export const rejectDiningRequest = async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

        if (restaurant.diningEnabled) {
            return errorResponse(res, 400, 'Dining is already enabled for this restaurant');
        }

        const currentStatus = getEffectiveDiningStatus(restaurant);
        if (!restaurant.diningRequested && !currentStatus) {
            return errorResponse(res, 400, 'This restaurant has not requested dining enable yet');
        }

        restaurant.diningRequested = true;
        if (!restaurant.diningRequestDate) {
            restaurant.diningRequestDate = new Date();
        }
        restaurant.diningStatus = DINING_STATUSES.REJECTED;
        await restaurant.save();

        return successResponse(res, 200, 'Dining request rejected successfully', {
            restaurantId: restaurant._id,
            diningStatus: restaurant.diningStatus,
            statusLabel: getAdminDiningStatusLabel(restaurant)
        });
    } catch (error) {
        console.error('Error rejecting dining request:', error);
        return errorResponse(res, 500, 'Failed to reject dining request');
    }
};

// ==================== DINING STORIES ====================

export const getAdminDiningStories = async (req, res) => {
    try {
        const stories = await DiningStory.find().sort({ createdAt: -1 }).lean();
        return successResponse(res, 200, 'Stories retrieved successfully', { stories });
    } catch (error) {
        console.error('Error fetching stories:', error);
        return errorResponse(res, 500, 'Failed to fetch stories');
    }
};

export const createDiningStory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/stories',
            resource_type: 'image'
        });

        const story = new DiningStory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id
        });

        await story.save();

        return successResponse(res, 201, 'Story created successfully', { story });
    } catch (error) {
        console.error('Error creating story:', error);
        return errorResponse(res, 500, 'Failed to create story');
    }
};

export const deleteDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        try {
            await cloudinary.uploader.destroy(story.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningStory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Story deleted successfully');
    } catch (error) {
        console.error('Error deleting story:', error);
        return errorResponse(res, 500, 'Failed to delete story');
    }
};

export const updateDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        if (name) story.name = name;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(story.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/stories',
                resource_type: 'image'
            });

            story.imageUrl = result.secure_url;
            story.cloudinaryPublicId = result.public_id;
        }

        await story.save();

        return successResponse(res, 200, 'Story updated successfully', { story });
    } catch (error) {
        console.error('Error updating story:', error);
        return errorResponse(res, 500, 'Failed to update story');
    }
};

// ==================== DINING ACTIVATION FEE SETTINGS ====================

export const getDiningActivationFeeSettings = async (req, res) => {
    try {
        const settings = await BusinessSettings.getSettings();
        const activationFeeAmount = Number(settings?.diningActivationFee) || 0;

        return successResponse(res, 200, 'Dining activation fee retrieved successfully', {
            activationFeeAmount
        });
    } catch (error) {
        console.error('Error fetching dining activation fee:', error);
        return errorResponse(res, 500, 'Failed to fetch dining activation fee');
    }
};

export const updateDiningActivationFeeSettings = async (req, res) => {
    try {
        const { activationFeeAmount } = req.body;

        const parsedAmount = Number(activationFeeAmount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
            return errorResponse(res, 400, 'Activation fee amount must be a number greater than or equal to 0');
        }

        const settings = await BusinessSettings.getSettings();
        settings.diningActivationFee = parsedAmount;

        if (req.admin?._id) {
            settings.updatedBy = req.admin._id;
        }

        await settings.save();

        return successResponse(res, 200, 'Dining activation fee updated successfully', {
            activationFeeAmount: Number(settings.diningActivationFee) || 0
        });
    } catch (error) {
        console.error('Error updating dining activation fee:', error);
        return errorResponse(res, 500, 'Failed to update dining activation fee');
    }
};

// ==================== DINING BOOKINGS ====================

export const getAllDiningBookings = async (req, res) => {
    try {
        console.log('🎯 getAllDiningBookings route hit');
        const bookings = await DiningBooking.find()
            .populate('restaurantId', 'name')
            .sort({ createdAt: -1 })
            .lean();
        return successResponse(res, 200, 'All dining bookings retrieved successfully', bookings);
    } catch (error) {
        console.error('Error fetching all dining bookings:', error);
        return errorResponse(res, 500, 'Failed to fetch dining bookings');
    }
};
