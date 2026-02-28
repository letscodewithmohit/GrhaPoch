import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
  updateUserLocation,
  getUserLocation,
  getUserAddresses,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadMiddleware } from '../utils/cloudinaryService.js';
import { createDonationOrder, verifyDonation } from '../controllers/donationController.js';
import userWalletRoutes from './userWalletRoutes.js';
import complaintRoutes from './complaintRoutes.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);

// Profile routes
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);

// Profile image upload
router.post(
  '/profile/avatar',
  uploadMiddleware.single('image'),
  uploadProfileImage
);

// Location routes
router.get('/location', getUserLocation);
router.put('/location', updateUserLocation);

// Address routes
router.get('/addresses', getUserAddresses);
router.post('/addresses', addUserAddress);
router.put('/addresses/:id', updateUserAddress);
router.delete('/addresses/:id', deleteUserAddress);

// Wallet routes
router.use('/wallet', userWalletRoutes);

// Complaint routes
router.use('/complaints', complaintRoutes);

// Donation routes
router.post('/donation/create', createDonationOrder);
router.post('/donation/verify', verifyDonation);

export default router;

