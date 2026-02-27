import Donation from '../models/Donation.js';
import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import * as razorpayService from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';
import AdminWallet from '../../admin/models/AdminWallet.js';

const buildLatestPaymentMap = async (orders = []) => {
    if (!Array.isArray(orders) || orders.length === 0) return new Map();

    const orderIds = orders.map((order) => order?._id).filter(Boolean);
    if (orderIds.length === 0) return new Map();

    const payments = await Payment.find({ orderId: { $in: orderIds } })
        .select('orderId paymentId transactionId method status razorpay.paymentId createdAt')
        .sort({ createdAt: -1 })
        .lean();

    const paymentMap = new Map();
    for (const payment of payments) {
        const key = String(payment.orderId);
        // Keep latest payment entry per order.
        if (!paymentMap.has(key)) {
            paymentMap.set(key, payment);
        }
    }

    return paymentMap;
};

const resolvePaymentReference = (order, paymentDoc) => {
    const method = order?.payment?.method || paymentDoc?.method || '';
    const directReference = order?.payment?.razorpayPaymentId || order?.payment?.transactionId || '';
    const paymentReference =
        paymentDoc?.razorpay?.paymentId ||
        paymentDoc?.transactionId ||
        paymentDoc?.paymentId ||
        '';
    const resolvedReference = directReference || paymentReference;

    if (resolvedReference) {
        return {
            paymentMethod: method || 'unknown',
            paymentReference: resolvedReference
        };
    }

    if (method === 'cash') {
        return {
            paymentMethod: 'cash',
            paymentReference: order?.orderId ? `COD-${order.orderId}` : 'COD'
        };
    }

    if (method === 'wallet') {
        return {
            paymentMethod: 'wallet',
            paymentReference: order?.orderId ? `WALLET-${order.orderId}` : 'WALLET'
        };
    }

    return {
        paymentMethod: method || 'unknown',
        paymentReference: order?.orderId || ''
    };
};

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
        // Use delivered order donations as the primary source so this matches admin dashboard totals.
        const donationOrders = await Order.find({
            status: 'delivered',
            'pricing.donation': { $gt: 0 }
        })
            .populate('userId', 'name email phone')
            .sort({ deliveredAt: -1, createdAt: -1 })
            .lean();

        const paymentMap = await buildLatestPaymentMap(donationOrders);

        const donations = donationOrders.map((order) => {
            const paymentInfo = resolvePaymentReference(order, paymentMap.get(String(order._id)));
            return {
                ...paymentInfo,
                _id: order._id,
                orderNumber: order.orderId || '',
                userId: order.userId || null,
                amount: Number(order?.pricing?.donation || 0),
                // Kept for backward compatibility with existing frontend references.
                razorpayPaymentId: paymentInfo.paymentReference || '',
                donatedAt: order.deliveredAt || order.updatedAt || order.createdAt,
                createdAt: order.createdAt,
                source: 'order'
            };
        });

        const totalAmount = donations.reduce((sum, donation) => sum + Number(donation.amount || 0), 0);

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

/**
 * @desc Get all tips (Admin only)
 * @route GET /api/admin/tips
 * @access Private/Admin
 */
export const getAllTips = async (req, res) => {
    try {
        // Use delivered order tips so this stays aligned with admin dashboard tip totals.
        const tipOrders = await Order.find({
            status: 'delivered',
            'pricing.tip': { $gt: 0 }
        })
            .populate('userId', 'name email phone')
            .populate('deliveryPartnerId', 'name phone deliveryId')
            .sort({ deliveredAt: -1, createdAt: -1 })
            .lean();

        const paymentMap = await buildLatestPaymentMap(tipOrders);

        const tips = tipOrders.map((order) => {
            const paymentInfo = resolvePaymentReference(order, paymentMap.get(String(order._id)));
            return {
                ...paymentInfo,
                _id: order._id,
                orderNumber: order.orderId || '',
                userId: order.userId || null,
                rider: order.deliveryPartnerId
                    ? {
                        _id: order.deliveryPartnerId?._id || null,
                        name: order.deliveryPartnerId?.name || '',
                        phone: order.deliveryPartnerId?.phone || '',
                        deliveryId: order.deliveryPartnerId?.deliveryId || ''
                    }
                    : null,
                amount: Number(order?.pricing?.tip || 0),
                // Kept for backward compatibility with existing frontend references.
                razorpayPaymentId: paymentInfo.paymentReference || '',
                tippedAt: order.deliveredAt || order.updatedAt || order.createdAt,
                createdAt: order.createdAt,
                source: 'order'
            };
        });

        const totalAmount = tips.reduce((sum, tip) => sum + Number(tip.amount || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                tips,
                totalAmount
            }
        });
    } catch (error) {
        console.error('Error fetching tips:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
