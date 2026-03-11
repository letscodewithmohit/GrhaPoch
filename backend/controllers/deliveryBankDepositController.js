import Joi from 'joi';
import DeliveryBankDeposit from '../models/DeliveryBankDeposit.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import BusinessSettings from '../models/BusinessSettings.js';
import { uploadToCloudinary } from '../utils/cloudinaryService.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const createBankDepositSchema = Joi.object({
  amount: Joi.number().positive().required()
});

const MAX_SLIP_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_SLIP_TYPES = ['image/jpeg', 'image/png'];

export const getBankDepositDetails = asyncHandler(async (req, res) => {
  const settings = await BusinessSettings.getSettings();
  let latest = null;
  if (req.delivery?._id) {
    latest = await DeliveryBankDeposit.findOne({ deliveryId: req.delivery._id })
      .sort({ createdAt: -1 })
      .lean();
  }
  return successResponse(res, 200, 'Bank deposit details', {
    bankName: settings?.bankName || '',
    accountHolder: settings?.accountHolder || '',
    accountNumber: settings?.accountNumber || '',
    ifsc: settings?.ifsc || '',
    branch: settings?.branch || '',
    approvalTime: settings?.approvalTime || '',
    latestDepositStatus: latest?.status || '',
    latestDepositReason: latest?.rejectionReason || ''
  });
});

export const createBankDeposit = asyncHandler(async (req, res) => {
  const delivery = req.delivery;
  if (!delivery?._id) {
    return errorResponse(res, 401, 'Delivery authentication required');
  }

  const { error: ve } = createBankDepositSchema.validate(req.body || {});
  if (ve) {
    return errorResponse(res, 400, ve.details[0].message || 'Amount is required');
  }

  const amount = Number(req.body.amount);
  if (amount < 1) {
    return errorResponse(res, 400, 'Minimum deposit amount is ₹1');
  }
  if (amount > 500000) {
    return errorResponse(res, 400, 'Maximum deposit amount is ₹5,00,000');
  }

  const files = Array.isArray(req.files)
    ? req.files
    : req.files?.slips
      ? req.files.slips
      : req.files?.slip
        ? req.files.slip
        : req.file
          ? [req.file]
          : [];
  if (!files.length) {
    return errorResponse(res, 400, 'Bank slip is required');
  }
  if (files.length > 5) {
    return errorResponse(res, 400, 'You can upload maximum 5 slips');
  }
  for (const f of files) {
    if (!ALLOWED_SLIP_TYPES.includes(f.mimetype)) {
      return errorResponse(res, 400, 'Only JPG/PNG bank slip is allowed');
    }
    if (f.size > MAX_SLIP_SIZE_BYTES) {
      return errorResponse(res, 400, 'Bank slip size must be 2MB or less');
    }
  }

  const wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);
  const cashInHand = Number(wallet.cashInHand) || 0;
  if (cashInHand < 1) {
    return errorResponse(res, 400, 'No cash in hand to deposit');
  }
  if (cashInHand < amount) {
    return errorResponse(res, 400, `Insufficient cash in hand (₹${cashInHand.toFixed(2)}).`);
  }
  if (Math.abs(cashInHand - amount) > 0.01) {
    return errorResponse(res, 400, `Bank deposit must be full cash-in-hand amount (₹${cashInHand.toFixed(2)}).`);
  }

  const pending = await DeliveryBankDeposit.findOne({
    deliveryId: delivery._id,
    status: 'pending'
  }).lean();
  if (pending) {
    return errorResponse(res, 400, 'You already have a pending bank deposit. Please wait for admin approval.');
  }

  const uploads = [];
  for (const f of files) {
    const uploaded = await uploadToCloudinary(f.buffer, {
      folder: 'appzeto/delivery/bank-deposits',
      resource_type: 'image'
    });
    uploads.push({
      url: uploaded.secure_url,
      publicId: uploaded.public_id
    });
  }

  const deposit = await DeliveryBankDeposit.create({
    deliveryId: delivery._id,
    amount,
    slip: uploads[0] || { url: '', publicId: '' },
    slips: uploads,
    status: 'pending',
    submittedAt: new Date(),
    metadata: new Map([['cashInHandAtSubmit', cashInHand]])
  });

  const walletTx = wallet.addTransaction({
    amount,
    type: 'deposit',
    status: 'Pending',
    description: 'Bank deposit pending approval',
    paymentMethod: 'bank_transfer',
    metadata: {
      depositId: deposit._id.toString(),
      slipUrl: uploads[0]?.url || ''
    }
  });
  wallet.markModified('transactions');
  await wallet.save();

  deposit.transactionId = walletTx?._id || null;
  await deposit.save();

  return successResponse(res, 201, 'Bank deposit submitted', {
    deposit
  });
});

export const listBankDeposits = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) {
    filter.status = status;
  }

  const deposits = await DeliveryBankDeposit.find(filter)
    .populate('deliveryId', 'name phone email')
    .sort({ createdAt: -1 })
    .lean();

  return successResponse(res, 200, 'Bank deposits retrieved', {
    deposits
  });
});

export const approveBankDeposit = asyncHandler(async (req, res) => {
  const adminId = req.admin?._id || null;
  const deposit = await DeliveryBankDeposit.findById(req.params.id);
  if (!deposit) {
    return errorResponse(res, 404, 'Deposit not found');
  }
  if (deposit.status !== 'pending') {
    return errorResponse(res, 400, `Deposit already ${deposit.status}`);
  }

  const wallet = await DeliveryWallet.findOrCreateByDeliveryId(deposit.deliveryId);
  const cashInHand = Number(wallet.cashInHand) || 0;
  const depositAmount = Number(deposit.amount) || 0;
  if (depositAmount < 1) {
    return errorResponse(res, 400, 'Invalid deposit amount.');
  }
  if (cashInHand < 1) {
    return errorResponse(res, 400, 'No cash in hand to settle.');
  }
  if (cashInHand + 0.01 < depositAmount) {
    return errorResponse(res, 400, 'Cash in hand is less than deposited amount. Please submit a fresh deposit.');
  }
  if (Math.abs(cashInHand - depositAmount) > 0.01) {
    return errorResponse(res, 400, 'Cash in hand has changed since submission. Please submit a fresh deposit for full cash in hand.');
  }

  if (!deposit.transactionId) {
    const byMeta = wallet.transactions?.find(
      (t) => t.type === 'deposit' &&
      t.status === 'Pending' &&
      (t.metadata?.depositId === deposit._id.toString() ||
        (t.metadata?.get && t.metadata.get('depositId') === deposit._id.toString()))
    );
    const byDesc = wallet.transactions?.find(
      (t) => t.type === 'deposit' &&
      t.status === 'Pending' &&
      String(t.description || '').toLowerCase().includes('bank deposit')
    );
    const match = byMeta || byDesc;
    if (match?._id) {
      deposit.transactionId = match._id;
    }
  }

  let didUpdateTx = false;
  if (deposit.transactionId) {
    try {
      wallet.updateTransactionStatus(deposit.transactionId, 'Completed');
      didUpdateTx = true;
    } catch (_) {
      // fallback below
    }
  }
  if (!didUpdateTx) {
    const tx = wallet.addTransaction({
      amount: deposit.amount,
      type: 'deposit',
      status: 'Completed',
      description: 'Cash limit deposit via Bank',
      paymentMethod: 'bank_transfer',
      processedAt: new Date(),
      processedBy: adminId
    });
    if (tx?._id) {
      deposit.transactionId = tx._id;
    }
  }
  wallet.markModified('transactions');
  await wallet.save();

  deposit.status = 'approved';
  deposit.approvedAt = new Date();
  deposit.approvedBy = adminId;
  await deposit.save();

  return successResponse(res, 200, 'Deposit approved', {
    deposit
  });
});

export const rejectBankDeposit = asyncHandler(async (req, res) => {
  const adminId = req.admin?._id || null;
  const { reason } = req.body || {};
  const deposit = await DeliveryBankDeposit.findById(req.params.id);
  if (!deposit) {
    return errorResponse(res, 404, 'Deposit not found');
  }
  if (deposit.status !== 'pending') {
    return errorResponse(res, 400, `Deposit already ${deposit.status}`);
  }

  deposit.status = 'rejected';
  deposit.rejectedAt = new Date();
  deposit.rejectedBy = adminId;
  deposit.rejectionReason = String(reason || '').trim();
  await deposit.save();

  if (!deposit.transactionId) {
    try {
      const wallet = await DeliveryWallet.findOrCreateByDeliveryId(deposit.deliveryId);
      const byMeta = wallet.transactions?.find(
        (t) => t.type === 'deposit' &&
        t.status === 'Pending' &&
        (t.metadata?.depositId === deposit._id.toString() ||
          (t.metadata?.get && t.metadata.get('depositId') === deposit._id.toString()))
      );
      const byDesc = wallet.transactions?.find(
        (t) => t.type === 'deposit' &&
        t.status === 'Pending' &&
        String(t.description || '').toLowerCase().includes('bank deposit')
      );
      const match = byMeta || byDesc;
      if (match?._id) {
        deposit.transactionId = match._id;
        await deposit.save();
      }
    } catch (_) {}
  }

  if (deposit.transactionId) {
    try {
      const wallet = await DeliveryWallet.findOrCreateByDeliveryId(deposit.deliveryId);
      wallet.updateTransactionStatus(deposit.transactionId, 'Failed', deposit.rejectionReason || 'Rejected by admin');
      wallet.markModified('transactions');
      await wallet.save();
    } catch (_) {}
  }

  return successResponse(res, 200, 'Deposit rejected', {
    deposit
  });
});






