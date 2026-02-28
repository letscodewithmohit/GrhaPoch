import express from 'express';
import { uploadMiddleware } from '../utils/cloudinaryService.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/admin.auth.js';
import { errorResponse } from '../utils/response.js';
import {
  getUserAdvertisementPricing,
  createUserAdvertisement,
  listMyUserAdvertisements,
  getMyUserAdvertisementById,
  cancelMyPendingUserAdvertisement,
  createUserAdvertisementPaymentOrder,
  verifyUserAdvertisementPayment,
  listAdminUserAdvertisements,
  getAdminUserAdvertisementById,
  getAdminUserAdvertisementPricing,
  updateAdminUserAdvertisementPricing,
  approveUserAdvertisement,
  rejectUserAdvertisement,
  setUserAdvertisementPosition,
  setUserAdvertisementStatusByAdmin,
  deleteUserAdvertisementByAdmin,
  listPublicActiveUserAdvertisements
} from '../controllers/userAdvertisement.controller.js';

const router = express.Router();

const ensureUserRole = (req, res, next) => {
  if (!req.user || req.user.role !== 'user') {
    return errorResponse(res, 403, 'Only users can access this endpoint');
  }
  next();
};

router.get('/public/active', listPublicActiveUserAdvertisements);

router.use('/me', authenticate, ensureUserRole);
router.get('/me/advertisements/pricing', getUserAdvertisementPricing);
router.get('/me/advertisements', listMyUserAdvertisements);
router.get('/me/advertisements/:id', getMyUserAdvertisementById);
router.post('/me/advertisements', uploadMiddleware.single('banner'), createUserAdvertisement);
router.delete('/me/advertisements/:id/cancel', cancelMyPendingUserAdvertisement);
router.post('/me/advertisements/:id/payment-order', createUserAdvertisementPaymentOrder);
router.post('/me/advertisements/:id/verify-payment', verifyUserAdvertisementPayment);

router.use('/admin', authenticateAdmin);
router.get('/admin/advertisements/pricing', getAdminUserAdvertisementPricing);
router.patch('/admin/advertisements/pricing', updateAdminUserAdvertisementPricing);
router.get('/admin/advertisements', listAdminUserAdvertisements);
router.get('/admin/advertisements/:id', getAdminUserAdvertisementById);
router.patch('/admin/advertisements/:id/approve', approveUserAdvertisement);
router.patch('/admin/advertisements/:id/reject', rejectUserAdvertisement);
router.patch('/admin/advertisements/:id/position', setUserAdvertisementPosition);
router.patch('/admin/advertisements/:id/status', setUserAdvertisementStatusByAdmin);
router.delete('/admin/advertisements/:id', deleteUserAdvertisementByAdmin);

export default router;
