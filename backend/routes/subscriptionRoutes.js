import express from 'express';
import { authenticate } from '../middleware/restaurant.auth.js';
import {
    createSubscriptionOrder,
    verifyPaymentAndActivate,
    getSubscriptionStatus,
    handleSubscriptionWebhook,
    cancelSubscription
} from '../controllers/subscriptionController.js';
import { getActiveSubscriptionPlans } from '../controllers/subscriptionPlanController.js';

const router = express.Router();

// Razorpay webhook for subscription payments (no auth)
router.post('/webhook', handleSubscriptionWebhook);

// Create Razorpay subscription (legacy path retained for compatibility)
router.post('/create-order', authenticate, createSubscriptionOrder);
router.post('/create-subscription', authenticate, createSubscriptionOrder);

// Verify payment and activate subscription
router.post('/verify-payment', authenticate, verifyPaymentAndActivate);

// Cancel active subscription (stop Razorpay auto-pay)
router.post('/cancel', authenticate, cancelSubscription);
router.delete('/cancel', authenticate, cancelSubscription);

// Get subscription status
router.get('/status', authenticate, getSubscriptionStatus);

// Get active subscription plans
router.get('/plans', authenticate, getActiveSubscriptionPlans);

export default router;
