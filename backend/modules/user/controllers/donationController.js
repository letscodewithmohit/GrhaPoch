import Donation from '../models/Donation.js';
import * as razorpayService from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';
import AdminWallet from '../../admin/models/AdminWallet.js';

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

        // 3. Add to Admin Wallet
        try {
            const adminWallet = await AdminWallet.findOrCreate();
            await adminWallet.addTransaction({
                amount: donation.amount,
                type: 'donation',
                status: 'Completed',
                description: `Donation from user ${donation.userId}`,
                metadata: {
                    donationId: donation._id,
                    razorpayPaymentId
                }
            });
            await adminWallet.save();
        } catch (walletError) {
            console.error('Error updating admin wallet for donation:', walletError);
            // We don't fail the verification if wallet update fails, but we log it
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

/**
 * @desc Get all donations (Admin only)
 * @route GET /api/admin/donations
 * @access Private/Admin
 */
export const getAllDonations = async (req, res) => {
    try {
        const donations = await Donation.find({ paymentStatus: 'completed' })
            .populate('userId', 'name email phone')
            .sort({ donatedAt: -1 });

        // Calculate total from donations (more reliable for history)
        const totalAmount = donations.reduce((sum, donation) => sum + donation.amount, 0);

        res.status(200).json({
            success: true,
            data: {
                donations,
                totalAmount
            }
        });
    } catch (error) {
        console.error('Error fetching donations:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
