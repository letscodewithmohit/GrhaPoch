import express from 'express';
import { handleRazorpayWebhook } from '../controllers/razorpayWebhookController.js';

const router = express.Router();

// Razorpay webhook (no auth)
router.post('/webhook', handleRazorpayWebhook);

export default router;
