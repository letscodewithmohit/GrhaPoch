import express from 'express';
import { initializeRazorpay } from '../services/razorpayService.js';

initializeRazorpay();

const router = express.Router();
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Payment module is active',
    razorpayConfigured: !!process.env.RAZORPAY_KEY_ID
  });
});

export default router;
