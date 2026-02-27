import express from 'express';
import { uploadMiddleware } from '../../shared/utils/cloudinaryService.js';
import { authenticate as authenticateRestaurant } from '../restaurant/middleware/restaurantAuth.js';
import { authenticateAdmin } from '../admin/middleware/adminAuth.js';
import {
  listRestaurantAdvertisements,
  getRestaurantAdvertisementById,
  createRestaurantAdvertisement,
  updateRestaurantAdvertisement,
  updateRestaurantAdvertisementStatus,
  duplicateRestaurantAdvertisement,
  deleteRestaurantAdvertisement,
  listAdminAdvertisements,
  getAdminAdvertisementById,
  approveAdvertisement,
  rejectAdvertisement,
  setAdvertisementPriority,
  setAdvertisementStatusByAdmin,
  deleteAdvertisementByAdmin,
  getAdvertisementPricing,
  getRestaurantCurrentBannerAdvertisement,
  getAdminAdvertisementPricing,
  updateAdminAdvertisementPricing,
  createRestaurantBannerAdvertisement,
  createAdvertisementPaymentOrder,
  verifyAdvertisementPayment,
  listPublicActiveAdvertisements
} from './controllers/advertisementController.js';

const router = express.Router();

const advertisementUploadFields = uploadMiddleware.fields([
  { name: 'file', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

// Public advertisement route (also exposed under /api/campaign/active)
router.get('/active', listPublicActiveAdvertisements);

// Restaurant advertisement routes
router.get('/restaurant/advertisements', authenticateRestaurant, listRestaurantAdvertisements);
router.get('/restaurant/advertisements/pricing', authenticateRestaurant, getAdvertisementPricing);
router.get('/restaurant/advertisements/current-banner', authenticateRestaurant, getRestaurantCurrentBannerAdvertisement);
router.get('/restaurant/advertisements/:id', authenticateRestaurant, getRestaurantAdvertisementById);
router.post('/restaurant/advertisements', authenticateRestaurant, advertisementUploadFields, createRestaurantAdvertisement);
router.post('/restaurant/advertisements/banner', authenticateRestaurant, uploadMiddleware.single('banner'), createRestaurantBannerAdvertisement);
router.put('/restaurant/advertisements/:id', authenticateRestaurant, advertisementUploadFields, updateRestaurantAdvertisement);
router.patch('/restaurant/advertisements/:id/status', authenticateRestaurant, updateRestaurantAdvertisementStatus);
router.post('/restaurant/advertisements/:id/duplicate', authenticateRestaurant, duplicateRestaurantAdvertisement);
router.delete('/restaurant/advertisements/:id', authenticateRestaurant, deleteRestaurantAdvertisement);

// Restaurant payment routes for approved banner advertisements
router.post('/restaurant/advertisements/:id/payment-order', authenticateRestaurant, createAdvertisementPaymentOrder);
router.post('/restaurant/advertisements/:id/verify-payment', authenticateRestaurant, verifyAdvertisementPayment);

// Admin advertisement routes
router.get('/admin/advertisements', authenticateAdmin, listAdminAdvertisements);
router.get('/admin/advertisements/pricing', authenticateAdmin, getAdminAdvertisementPricing);
router.get('/admin/advertisements/:id', authenticateAdmin, getAdminAdvertisementById);
router.patch('/admin/advertisements/pricing', authenticateAdmin, updateAdminAdvertisementPricing);
router.patch('/admin/advertisements/:id/approve', authenticateAdmin, approveAdvertisement);
router.patch('/admin/advertisements/:id/reject', authenticateAdmin, rejectAdvertisement);
router.patch('/admin/advertisements/:id/priority', authenticateAdmin, setAdvertisementPriority);
router.patch('/admin/advertisements/:id/status', authenticateAdmin, setAdvertisementStatusByAdmin);
router.delete('/admin/advertisements/:id', authenticateAdmin, deleteAdvertisementByAdmin);

export default router;
