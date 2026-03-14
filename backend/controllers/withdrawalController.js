import WithdrawalRequest from '../models/WithdrawalRequest.js';
import RestaurantWallet from '../models/RestaurantWallet.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../utils/response.js';
import asyncHandler from '../middleware/asyncHandler.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Create Withdrawal Request
 * POST /api/restaurant/withdrawal/request
 */
export const createWithdrawalRequest = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { amount, paymentMethod = 'admin_select', upiId, qrCode } = req.body;

    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    if (!amount || amount <= 0) {
      return errorResponse(res, 400, 'Valid withdrawal amount is required');
    }

    // Get restaurant wallet
    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);

    // Check if sufficient balance
    const availableBalance = wallet.totalBalance || 0;
    if (amount > availableBalance) {
      return errorResponse(res, 400, `Insufficient balance. Available balance: ₹${availableBalance.toFixed(2)}`);
    }

    // Check for pending requests
    const pendingRequest = await WithdrawalRequest.findOne({
      restaurantId: restaurant._id,
      status: 'Pending'
    });

    if (pendingRequest) {
      return errorResponse(res, 400, 'You already have a pending withdrawal request. Please wait until it is processed.');
    }

    // Get restaurant details for payout info
    const restaurantDetails = await Restaurant.findById(restaurant._id);
    if (!restaurantDetails) {
      return errorResponse(res, 404, 'Restaurant details not found');
    }

    // Extract payout details from profile
    const onboardingBank = restaurantDetails.onboarding?.step3?.bank || {};
    const normalizedBankDetails = onboardingBank.accountNumber ? {
      accountHolderName: onboardingBank.accountHolderName,
      accountNumber: onboardingBank.accountNumber,
      ifscCode: onboardingBank.ifscCode,
      bankName: onboardingBank.bankName || 'N/A'
    } : null;

    const normalizedUpiId = (upiId || onboardingBank.upiId || '').trim() || null;

    let normalizedQrCode = null;
    if (qrCode?.url) {
      normalizedQrCode = { url: qrCode.url, publicId: qrCode.publicId || '' };
    } else if (onboardingBank.qrCode?.url) {
      normalizedQrCode = {
        url: onboardingBank.qrCode.url,
        publicId: onboardingBank.qrCode.publicId || ''
      };
    }

    if (!normalizedBankDetails && !normalizedUpiId && !normalizedQrCode) {
      return errorResponse(res, 400, 'Add payout details (Bank/UPI/QR) in profile before requesting withdrawal');
    }
    logger.info(`Withdrawal request creating for restaurant: ${restaurant._id}. Payout info found: Bank:${!!normalizedBankDetails}, UPI:${!!normalizedUpiId}, QR:${!!normalizedQrCode}`);

    // Create withdrawal request
    const withdrawalRequest = await WithdrawalRequest.create({
      restaurantId: restaurant._id,
      amount: parseFloat(amount),
      status: 'Pending',
      paymentMethod,
      bankDetails: normalizedBankDetails || undefined,
      upiId: normalizedUpiId || undefined,
      qrCode: normalizedQrCode || undefined,
      restaurantName: restaurantDetails.name || 'Unknown',
      restaurantIdString: restaurantDetails.restaurantId || restaurant._id.toString(),
      walletId: wallet._id
    });

    // Create a pending withdrawal transaction in wallet
    const transaction = wallet.addTransaction({
      amount: parseFloat(amount),
      type: 'withdrawal',
      status: 'Pending',
      description: `Withdrawal request created - Request ID: ${withdrawalRequest._id}`
    });

    // Deduct balance immediately
    wallet.totalBalance = Math.max(0, (wallet.totalBalance || 0) - parseFloat(amount));
    await wallet.save();

    // Link transaction ID to withdrawal request
    withdrawalRequest.transactionId = transaction._id;
    await withdrawalRequest.save();

    logger.info(`Withdrawal request created: ${withdrawalRequest._id} for restaurant: ${restaurant._id}, amount: ${amount}.`);

    return successResponse(res, 201, 'Withdrawal request created successfully', {
      withdrawalRequest: {
        id: withdrawalRequest._id,
        amount: withdrawalRequest.amount,
        status: withdrawalRequest.status,
        requestedAt: withdrawalRequest.requestedAt
      }
    });
  } catch (error) {
    logger.error(`Error creating withdrawal request: ${error.message}`);
    return errorResponse(res, 500, 'Failed to create withdrawal request');
  }
});

/**
 * Get Restaurant Withdrawal Requests (for restaurant)
 * GET /api/restaurant/withdrawal/requests
 */
export const getRestaurantWithdrawalRequests = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { status, page = 1, limit = 20 } = req.query;

    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    const query = { restaurantId: restaurant._id };
    if (status && ['Pending', 'Approved', 'Rejected', 'Processed'].includes(status)) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const requests = await WithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('processedBy', 'name email')
      .lean();

    const total = await WithdrawalRequest.countDocuments(query);

    return successResponse(res, 200, 'Withdrawal requests retrieved successfully', {
      requests: requests.map(req => ({
        id: req._id,
        amount: req.amount,
        status: req.status,
        requestedAt: req.requestedAt,
        processedAt: req.processedAt,
        rejectionReason: req.rejectionReason,
        bankDetails: req.bankDetails,
        upiId: req.upiId,
        qrCode: req.qrCode,
        paymentScreenshot: req.paymentScreenshot,
        paymentMethod: req.paymentMethod,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching withdrawal requests: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch withdrawal requests');
  }
});

/**
 * Get All Withdrawal Requests (for admin)
 * GET /api/admin/withdrawal/requests
 */
export const getAllWithdrawalRequests = asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (status && ['Pending', 'Approved', 'Rejected', 'Processed'].includes(status)) {
      query.status = status;
    }

    // Search by restaurant name or ID
    if (search) {
      query.$or = [
        { restaurantName: { $regex: search, $options: 'i' } },
        { restaurantIdString: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const requests = await WithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('restaurantId', 'name restaurantId address onboarding')
      .populate('processedBy', 'name email')
      .lean();

    const total = await WithdrawalRequest.countDocuments(query);

    return successResponse(res, 200, 'Withdrawal requests retrieved successfully', {
      requests: requests.map(w => {
        // Find best bank details
        let bank = w.bankDetails;
        if (!bank || !bank.accountNumber) {
          const restBank = w.restaurantId?.onboarding?.step3?.bank;
          if (restBank?.accountNumber) {
            bank = {
              accountNumber: restBank.accountNumber,
              ifscCode: restBank.ifscCode,
              accountHolderName: restBank.accountHolderName,
              bankName: restBank.bankName || 'N/A'
            };
          }
        }

        // Find best UPI
        const upi = w.upiId || w.restaurantId?.onboarding?.step3?.bank?.upiId || null;

        // Find best QR
        const qr = w.qrCode?.url ? w.qrCode : (w.restaurantId?.onboarding?.step3?.bank?.qrCode || null);

        return {
          id: w._id,
          restaurantId: w.restaurantId?._id || w.restaurantId,
          restaurantName: w.restaurantName || w.restaurantId?.name || 'Unknown',
          restaurantIdString: w.restaurantIdString || w.restaurantId?.restaurantId || 'N/A',
          restaurantAddress: w.restaurantId?.address || 'N/A',
          amount: w.amount,
          status: w.status,
          requestedAt: w.requestedAt,
          processedAt: w.processedAt,
          processedBy: w.processedBy ? {
            name: w.processedBy.name,
            email: w.processedBy.email
          } : null,
          bankDetails: bank,
          upiId: upi,
          qrCode: qr,
          paymentScreenshot: w.paymentScreenshot,
          paymentMethod: w.paymentMethod,
          rejectionReason: w.rejectionReason,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt
        };
      }),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching all withdrawal requests: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch withdrawal requests');
  }
});

/**
 * Approve Withdrawal Request (admin only)
 * POST /api/admin/withdrawal/:id/approve
 */
export const approveWithdrawalRequest = asyncHandler(async (req, res) => {
  try {
    const admin = req.admin;
    const { id } = req.params;
    const { paymentScreenshot, paymentMethod } = req.body || {};

    if (!admin?._id) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    const withdrawalRequest = await WithdrawalRequest.findById(id);

    if (!withdrawalRequest) {
      return errorResponse(res, 404, 'Withdrawal request not found');
    }

    if (withdrawalRequest.status !== 'Pending') {
      return errorResponse(res, 400, `Withdrawal request is already ${withdrawalRequest.status}`);
    }

    // Validate screenshot requirement
    let screenshotData = null;
    if (paymentScreenshot) {
      if (typeof paymentScreenshot === 'string') {
        screenshotData = { url: paymentScreenshot };
      } else if (paymentScreenshot?.url) {
        screenshotData = {
          url: paymentScreenshot.url,
          publicId: paymentScreenshot.publicId || ''
        };
      }
    }

    if (!screenshotData?.url) {
      return errorResponse(res, 400, 'Payment screenshot is required to approve the withdrawal');
    }

    // Get restaurant wallet
    const wallet = await RestaurantWallet.findById(withdrawalRequest.walletId ||
      (await RestaurantWallet.findOne({ restaurantId: withdrawalRequest.restaurantId }))?._id);

    if (!wallet) {
      return errorResponse(res, 404, 'Restaurant wallet not found');
    }

    // Update withdrawal request
    withdrawalRequest.status = 'Approved';
    withdrawalRequest.processedAt = new Date();
    withdrawalRequest.processedBy = admin._id;
    withdrawalRequest.paymentScreenshot = screenshotData;
    if (paymentMethod) withdrawalRequest.paymentMethod = paymentMethod;
    await withdrawalRequest.save();

    // Find and update the pending withdrawal transaction to Completed
    let t = wallet.transactions?.id?.(withdrawalRequest.transactionId) ?? null;
    if (!t && Array.isArray(wallet.transactions)) {
      const tid = (withdrawalRequest.transactionId?.toString?.() || String(withdrawalRequest.transactionId)).trim();
      t = wallet.transactions.find(
        (tx) => tx?._id && (tx._id.toString?.() || String(tx._id)) === tid
      ) ?? null;
    }

    if (t) {
      t.status = 'Completed';
      t.processedAt = new Date();
    } else {
      // Fallback: create a new one if not found
      wallet.addTransaction({
        amount: withdrawalRequest.amount,
        type: 'withdrawal',
        status: 'Completed',
        description: `Withdrawal request approved - Request ID: ${withdrawalRequest._id}`
      });
    }

    // Update totalWithdrawn only on approval
    wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + withdrawalRequest.amount;
    wallet.markModified('transactions');
    await wallet.save();

    logger.info(`Withdrawal request approved: ${id} by admin: ${admin._id}`);

    return successResponse(res, 200, 'Withdrawal request approved successfully', {
      withdrawalRequest: {
        id: withdrawalRequest._id,
        amount: withdrawalRequest.amount,
        status: withdrawalRequest.status,
        processedAt: withdrawalRequest.processedAt
      }
    });
  } catch (error) {
    logger.error(`Error approving withdrawal request: ${error.message}`);
    return errorResponse(res, 500, 'Failed to approve withdrawal request');
  }
});

/**
 * Reject Withdrawal Request (admin only)
 * POST /api/admin/withdrawal/:id/reject
 */
export const rejectWithdrawalRequest = asyncHandler(async (req, res) => {
  try {
    const admin = req.admin;
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!admin?._id) {
      return errorResponse(res, 401, 'Admin authentication required');
    }

    const withdrawalRequest = await WithdrawalRequest.findById(id);

    if (!withdrawalRequest) {
      return errorResponse(res, 404, 'Withdrawal request not found');
    }

    if (withdrawalRequest.status !== 'Pending') {
      return errorResponse(res, 400, `Withdrawal request is already ${withdrawalRequest.status}`);
    }

    // Get restaurant wallet to refund the balance
    const wallet = await RestaurantWallet.findById(withdrawalRequest.walletId ||
      (await RestaurantWallet.findOne({ restaurantId: withdrawalRequest.restaurantId }))?._id);

    if (!wallet) {
      return errorResponse(res, 404, 'Restaurant wallet not found');
    }

    // Update withdrawal request
    withdrawalRequest.status = 'Rejected';
    withdrawalRequest.processedAt = new Date();
    withdrawalRequest.processedBy = admin._id;
    if (rejectionReason) {
      withdrawalRequest.rejectionReason = rejectionReason;
    }
    await withdrawalRequest.save();

    // Find and update the pending withdrawal transaction to Cancelled
    let t = wallet.transactions?.id?.(withdrawalRequest.transactionId) ?? null;
    if (!t && Array.isArray(wallet.transactions)) {
      const tid = (withdrawalRequest.transactionId?.toString?.() || String(withdrawalRequest.transactionId)).trim();
      t = wallet.transactions.find(
        (tx) => tx?._id && (tx._id.toString?.() || String(tx._id)) === tid
      ) ?? null;
    }

    if (t && t.status === 'Pending') {
      t.status = 'Cancelled';
      t.processedAt = new Date();
      // Refund the balance back
      wallet.totalBalance = (wallet.totalBalance || 0) + withdrawalRequest.amount;
    } else if (!t) {
      // If transaction not found, create a refund transaction (fallback)
      wallet.addTransaction({
        amount: withdrawalRequest.amount,
        type: 'refund',
        status: 'Completed',
        description: `Withdrawal request rejected - Refund for Request ID: ${withdrawalRequest._id}`
      });
      wallet.totalBalance = (wallet.totalBalance || 0) + withdrawalRequest.amount;
    }

    wallet.markModified('transactions');
    await wallet.save();

    logger.info(`Withdrawal request rejected: ${id} by admin: ${admin._id}. Balance refunded.`);

    return successResponse(res, 200, 'Withdrawal request rejected successfully', {
      withdrawalRequest: {
        id: withdrawalRequest._id,
        amount: withdrawalRequest.amount,
        status: withdrawalRequest.status,
        processedAt: withdrawalRequest.processedAt,
        rejectionReason: withdrawalRequest.rejectionReason
      }
    });
  } catch (error) {
    logger.error(`Error rejecting withdrawal request: ${error.message}`);
    return errorResponse(res, 500, 'Failed to reject withdrawal request');
  }
});

