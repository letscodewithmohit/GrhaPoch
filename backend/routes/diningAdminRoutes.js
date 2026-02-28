import express from 'express';
import { uploadMiddleware } from '../utils/cloudinaryService.js';
import { authenticateAdmin } from '../middleware/admin.auth.js';
import {
    getAdminDiningCategories,
    createDiningCategory,
    deleteDiningCategory,
    getAdminDiningOfferBanners,
    createDiningOfferBanner,
    deleteDiningOfferBanner,
    updateDiningOfferBanner,
    getAdminDiningStories,
    createDiningStory,
    deleteDiningStory,
    updateDiningStory,
    getActiveRestaurants,
    updateDiningSettings,
    getAllDiningBookings,
    getDiningActivationFeeSettings,
    updateDiningActivationFeeSettings,
    getDiningRequests,
    approveDiningRequest,
    rejectDiningRequest
} from '../controllers/diningAdminController.js';

const router = express.Router();

// Categories
router.get('/categories', authenticateAdmin, getAdminDiningCategories);
router.post('/categories', authenticateAdmin, uploadMiddleware.single('image'), createDiningCategory);
router.delete('/categories/:id', authenticateAdmin, deleteDiningCategory);

// Offer Banners
router.get('/offer-banners', authenticateAdmin, getAdminDiningOfferBanners);
router.post('/offer-banners', authenticateAdmin, uploadMiddleware.single('image'), createDiningOfferBanner);
router.put('/offer-banners/:id', authenticateAdmin, uploadMiddleware.single('image'), updateDiningOfferBanner);
router.delete('/offer-banners/:id', authenticateAdmin, deleteDiningOfferBanner);

// Restaurants helper for dropdown
router.get('/restaurants-list', authenticateAdmin, getActiveRestaurants);

// Dining Settings for a Restaurant
router.put('/restaurant/:restaurantId/settings', authenticateAdmin, updateDiningSettings);

// Stories
router.get('/stories', authenticateAdmin, getAdminDiningStories);
router.post('/stories', authenticateAdmin, uploadMiddleware.single('image'), createDiningStory);
router.put('/stories/:id', authenticateAdmin, uploadMiddleware.single('image'), updateDiningStory);
router.delete('/stories/:id', authenticateAdmin, deleteDiningStory);

// Bookings
router.get('/bookings/all', authenticateAdmin, getAllDiningBookings);

// Activation Fee Settings
router.get('/settings/activation-fee', authenticateAdmin, getDiningActivationFeeSettings);
router.put('/settings/activation-fee', authenticateAdmin, updateDiningActivationFeeSettings);

// Dining Requests (Request -> Approval -> Payment -> Enable)
router.get('/requests', authenticateAdmin, getDiningRequests);
router.patch('/requests/:restaurantId/approve', authenticateAdmin, approveDiningRequest);
router.patch('/requests/:restaurantId/reject', authenticateAdmin, rejectDiningRequest);

export default router;
