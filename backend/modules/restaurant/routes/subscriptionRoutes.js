import express from 'express';
import { authenticate } from '../middleware/restaurantAuth.js';
import {
    createSubscriptionOrder,
    verifyPaymentAndActivate,
    getSubscriptionStatus
} from '../controllers/subscriptionController.js';

const router = express.Router();

// Create Razorpay order
router.post('/create-order', authenticate, createSubscriptionOrder);

// Verify payment and activate subscription
router.post('/verify-payment', authenticate, verifyPaymentAndActivate);

// Get subscription status
router.get('/status', authenticate, getSubscriptionStatus);

export default router;
