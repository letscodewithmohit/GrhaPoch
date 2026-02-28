import express from 'express';
import { authenticate } from '../middleware/restaurant.auth.js';
import {
    createSubscriptionOrder,
    verifyPaymentAndActivate,
    getSubscriptionStatus
} from '../controllers/subscriptionController.js';
import { getActiveSubscriptionPlans } from '../controllers/subscriptionPlanController.js';

const router = express.Router();

// Create Razorpay order
router.post('/create-order', authenticate, createSubscriptionOrder);

// Verify payment and activate subscription
router.post('/verify-payment', authenticate, verifyPaymentAndActivate);

// Get subscription status
router.get('/status', authenticate, getSubscriptionStatus);

// Get active subscription plans
router.get('/plans', authenticate, getActiveSubscriptionPlans);

export default router;
