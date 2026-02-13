import Donation from '../models/Donation.js';
import * as razorpayService from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';

/**
 * @desc Create a donation order
 * @route POST /api/user/donation/create
 * @access Private
 */
export const createDonationOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid donation amount'
            });
        }

        // Amount in paise for Razorpay
        const amountInPaise = Math.round(amount * 100);

        // Get Razorpay credentials
        const credentials = await getRazorpayCredentials();

        // Create Razorpay Order
        const razorpayOrder = await razorpayService.createOrder({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `donation_${Date.now()}`,
            notes: {
                userId,
                type: 'donation'
            }
        });

        // Save initial donation record
        const donation = await Donation.create({
            userId,
            amount,
            razorpayOrderId: razorpayOrder.id,
            paymentStatus: 'pending'
        });

        res.status(200).json({
            success: true,
            data: {
                razorpay: {
                    orderId: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currency,
                    key: credentials.keyId
                },
                donation
            }
        });
    } catch (error) {
        console.error('Error creating donation order:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

/**
 * @desc Verify donation payment
 * @route POST /api/user/donation/verify
 * @access Private
 */
export const verifyDonation = async (req, res) => {
    try {
        const { donationId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        // 1. Verify signature
        const isValid = await razorpayService.verifyPayment(
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
        );

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // 2. Update donation status
        const donation = await Donation.findByIdAndUpdate(
            donationId,
            {
                paymentStatus: 'completed',
                razorpayPaymentId,
                razorpaySignature,
                donatedAt: new Date()
            },
            { new: true }
        );

        if (!donation) {
            return res.status(404).json({
                success: false,
                message: 'Donation record not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Donation successful! Thank you.',
            data: { donation }
        });
    } catch (error) {
        console.error('Error verifying donation:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
