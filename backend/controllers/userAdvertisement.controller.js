import mongoose from 'mongoose';
import UserAdvertisement from '../models/UserAdvertisement.js';
import AdvertisementSetting from '../models/AdvertisementSetting.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryService.js';
import { createOrder, verifyPayment, fetchPayment } from '../services/razorpayService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ADVERTISEMENT_SETTING_KEY = 'user_banner_pricing';
const DEFAULT_USER_ADVERTISEMENT_PRICE_PER_DAY = Number(
  process.env.USER_ADVERTISEMENT_PRICE_PER_DAY || process.env.ADVERTISEMENT_PRICE_PER_DAY || 150
);
const ALLOWED_POSITIONS = new Set(['home_top', 'home_middle', 'home_bottom']);
const OPEN_USER_ADVERTISEMENT_STATUSES = ['pending', 'approved', 'payment_pending', 'active'];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfTomorrow = () => {
  const tomorrow = startOfToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

const startOfDay = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const endOfDay = (date) => {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizePosition = (value) => {
  const position = String(value || '').trim().toLowerCase();
  if (!ALLOWED_POSITIONS.has(position)) return null;
  return position;
};

const normalizeDateRange = ({ startDate, endDate }) => {
  return {
    startDate: startOfDay(startDate),
    endDate: endOfDay(endDate)
  };
};

const calculateDurationDays = ({ startDate, endDate }) => {
  const normalized = normalizeDateRange({ startDate, endDate });
  const difference = normalized.endDate.getTime() - normalized.startDate.getTime();
  return Math.floor(difference / DAY_MS) + 1;
};

const calculateTotalAmount = (durationDays, pricePerDay) => Number((durationDays * pricePerDay).toFixed(2));

const effectiveStatus = (ad, now = new Date()) => {
  const endDate = ad.endDate ? new Date(ad.endDate) : null;
  const startDate = ad.startDate ? new Date(ad.startDate) : null;

  if (ad.status === 'active') {
    if (endDate && endDate < now) return 'expired';
    if (startDate && startDate > now) return 'scheduled';
  }

  return ad.status;
};

const toUserPayload = (ad, options = {}) => {
  const statusNow = effectiveStatus(ad);
  const now = new Date();
  const parsedStart = ad.startDate ? startOfDay(ad.startDate) : null;
  const parsedEnd = ad.endDate ? endOfDay(ad.endDate) : null;
  const durationDays =
    Number(ad.durationDays) > 0
      ? Number(ad.durationDays)
      : (parsedStart && parsedEnd ? calculateDurationDays({ startDate: parsedStart, endDate: parsedEnd }) : 0);
  const isLiveNow = Boolean(
    ad.status === 'active' &&
    ad.paymentStatus === 'paid' &&
    ad.isActive === true &&
    parsedStart &&
    parsedEnd &&
    parsedStart <= now &&
    parsedEnd >= now
  );

  const payload = {
    id: ad._id,
    adId: ad.adId,
    bannerImage: ad.bannerImage,
    title: ad.title,
    durationDays,
    pricePerDay: ad.pricePerDay,
    totalAmount: ad.totalAmount,
    status: ad.status,
    effectiveStatus: statusNow,
    paymentStatus: ad.paymentStatus,
    paymentId: ad.paymentId || ad.razorpay?.paymentId || '',
    startDate: ad.startDate,
    endDate: ad.endDate,
    position: ad.position,
    isActive: Boolean(ad.isActive),
    rejectionReason: ad.rejectionReason || '',
    adminNote: ad.adminNote || '',
    approvedAt: ad.approvedAt || null,
    reviewedAt: ad.reviewedAt || null,
    canPay: ['approved', 'payment_pending'].includes(ad.status) && ad.paymentStatus !== 'paid',
    isLiveNow,
    paymentLogs: Array.isArray(ad.paymentLogs) ? ad.paymentLogs : [],
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt
  };

  if (options.includeUser) {
    payload.user = ad.userId
      ? {
        id: ad.userId._id,
        name: ad.userId.name || 'N/A',
        email: ad.userId.email || '',
        phone: ad.userId.phone || ''
      }
      : {
        id: null,
        name: 'Deleted User',
        email: '',
        phone: ''
      };
  }

  return payload;
};

const safeDeleteCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await deleteFromCloudinary(publicId);
  } catch (error) {
    console.warn(`[UserAdvertisement] Failed to delete Cloudinary media: ${publicId}`, error.message);
  }
};

const uploadBanner = async (file) => {
  if (!file?.buffer) {
    throw new Error('Banner image is required');
  }

  if (!String(file.mimetype || '').startsWith('image/')) {
    throw new Error('Only image banner is allowed');
  }

  const uploaded = await uploadToCloudinary(file.buffer, {
    folder: 'appzeto/user-advertisements/banners',
    resource_type: 'image'
  });

  return {
    url: uploaded.secure_url,
    publicId: uploaded.public_id
  };
};

const getDefaultPricePerDay = () => {
  if (!Number.isFinite(DEFAULT_USER_ADVERTISEMENT_PRICE_PER_DAY) || DEFAULT_USER_ADVERTISEMENT_PRICE_PER_DAY <= 0) {
    return 150;
  }
  return Number(DEFAULT_USER_ADVERTISEMENT_PRICE_PER_DAY.toFixed(2));
};

const getUserAdvertisementPricePerDay = async () => {
  const setting = await AdvertisementSetting.findOne({ key: USER_ADVERTISEMENT_SETTING_KEY }).select('pricePerDay').lean();
  const price = Number(setting?.pricePerDay);
  if (!Number.isFinite(price) || price <= 0) {
    return getDefaultPricePerDay();
  }
  return Number(price.toFixed(2));
};

const upsertUserAdvertisementPricePerDay = async ({ pricePerDay, adminId = null }) => {
  const updated = await AdvertisementSetting.findOneAndUpdate(
    { key: USER_ADVERTISEMENT_SETTING_KEY },
    {
      $set: {
        key: USER_ADVERTISEMENT_SETTING_KEY,
        pricePerDay: Number(pricePerDay),
        updatedBy: adminId || null
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(updated.pricePerDay || getDefaultPricePerDay());
};

const findUserAdvertisement = async (userId, identifier) => {
  const filter = { userId, isDeleted: false };

  if (isValidObjectId(identifier)) {
    filter.$or = [{ _id: identifier }, { adId: identifier }];
  } else {
    filter.adId = identifier;
  }

  return UserAdvertisement.findOne(filter);
};

const findUserAdvertisementByIdentifier = async (identifier) => {
  const filter = { isDeleted: false };

  if (isValidObjectId(identifier)) {
    filter.$or = [{ _id: identifier }, { adId: identifier }];
  } else {
    filter.adId = identifier;
  }

  return UserAdvertisement.findOne(filter);
};

const ensureStatusFreshness = async (ad) => {
  const currentEffectiveStatus = effectiveStatus(ad);
  if (currentEffectiveStatus === 'expired' && ad.status !== 'expired') {
    ad.status = 'expired';
    ad.isActive = false;
    await ad.save();
  }
};

const appendPaymentLog = (advertisement, log) => {
  const existing = Array.isArray(advertisement.paymentLogs) ? advertisement.paymentLogs : [];
  existing.push({
    status: log.status,
    orderId: String(log.orderId || ''),
    paymentId: String(log.paymentId || ''),
    message: String(log.message || ''),
    raw: log.raw ?? null,
    createdAt: new Date()
  });
  advertisement.paymentLogs = existing.slice(-20);
};

const hasPositionConflict = async ({ position, startDate, endDate, excludeId = null }) => {
  if (!position || !startDate || !endDate) return false;

  const query = {
    isDeleted: false,
    status: 'active',
    paymentStatus: 'paid',
    isActive: true,
    position,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const overlapping = await UserAdvertisement.findOne(query).select('_id');
  return Boolean(overlapping);
};

const computeCounts = (ads) => {
  const base = {
    all: ads.length,
    pending: 0,
    approved: 0,
    payment_pending: 0,
    active: 0,
    rejected: 0,
    expired: 0
  };

  ads.forEach((ad) => {
    const current = effectiveStatus(ad);
    if (base[current] !== undefined) {
      base[current] += 1;
    }
  });

  return base;
};

const computeRestaurantStyleFilterCounts = (ads) => {
  const base = { all: ads.length, pending: 0, active: 0, rejected: 0, expired: 0 };

  ads.forEach((ad) => {
    const status = String(ad.status || 'pending').toLowerCase();
    const current = String(effectiveStatus(ad) || status).toLowerCase();

    if (['pending', 'payment_pending'].includes(status)) base.pending += 1;
    if (['active', 'running', 'approved', 'paused', 'scheduled'].includes(current)) base.active += 1;
    if (status === 'rejected') base.rejected += 1;
    if (current === 'expired') base.expired += 1;
  });

  return base;
};

const matchesRestaurantStyleFilter = (ad, filter) => {
  const status = String(ad.status || 'pending').toLowerCase();
  const current = String(effectiveStatus(ad) || status).toLowerCase();

  if (filter === 'pending') return ['pending', 'payment_pending'].includes(status);
  if (filter === 'active') return ['active', 'running', 'approved', 'paused', 'scheduled'].includes(current);
  if (filter === 'rejected') return status === 'rejected';
  if (filter === 'expired') return current === 'expired';
  if (filter === 'all') return true;
  return current === filter || status === filter;
};

export const getUserAdvertisementPricing = asyncHandler(async (req, res) => {
  const pricePerDay = await getUserAdvertisementPricePerDay();
  return successResponse(res, 200, 'User advertisement pricing fetched successfully', {
    pricePerDay
  });
});

export const createUserAdvertisement = asyncHandler(async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 400, 'Banner image is required');
  }

  const title = String(req.body.title || '').trim();
  if (!title) {
    return errorResponse(res, 400, 'Title is required');
  }

  const parsedStartDateRaw = parseDate(req.body.startDate);
  const parsedEndDateRaw = parseDate(req.body.endDate);
  if (!parsedStartDateRaw || !parsedEndDateRaw) {
    return errorResponse(res, 400, 'Valid startDate and endDate are required');
  }

  const { startDate, endDate } = normalizeDateRange({
    startDate: parsedStartDateRaw,
    endDate: parsedEndDateRaw
  });

  if (startDate > endDate) {
    return errorResponse(res, 400, 'startDate cannot be after endDate');
  }

  if (startDate < startOfTomorrow()) {
    return errorResponse(res, 400, 'startDate must be tomorrow or later');
  }

  const durationDays = calculateDurationDays({ startDate, endDate });
  if (durationDays <= 0 || durationDays > 365) {
    return errorResponse(res, 400, 'Selected date range must be between 1 and 365 days');
  }

  const requestedPosition = normalizePosition(req.body.position);
  const position = requestedPosition || 'home_top';

  const uploadedBanner = await uploadBanner(req.file);
  const pricePerDay = await getUserAdvertisementPricePerDay();
  const totalAmount = calculateTotalAmount(durationDays, pricePerDay);

  const advertisement = await UserAdvertisement.create({
    userId: req.user._id,
    bannerImage: uploadedBanner.url,
    bannerPublicId: uploadedBanner.publicId,
    title,
    startDate,
    endDate,
    durationDays,
    pricePerDay,
    totalAmount,
    status: 'pending',
    paymentStatus: 'unpaid',
    position,
    isActive: false
  });

  return successResponse(res, 201, 'User advertisement request submitted successfully', {
    advertisement: toUserPayload(advertisement),
    pricing: {
      pricePerDay,
      durationDays,
      startDate,
      endDate,
      totalAmount
    }
  });
});

export const listMyUserAdvertisements = asyncHandler(async (req, res) => {
  const { status = 'all', q } = req.query;
  const ads = await UserAdvertisement.find({
    userId: req.user._id,
    isDeleted: false
  })
    .sort({ createdAt: -1 })
    .lean();

  const counts = computeCounts(ads);
  const filterCounts = computeRestaurantStyleFilterCounts(ads);
  let filtered = ads;
  const normalizedStatus = String(status || 'all').toLowerCase();

  if (normalizedStatus !== 'all') {
    filtered = filtered.filter((ad) => matchesRestaurantStyleFilter(ad, normalizedStatus));
  }

  if (q) {
    const search = String(q).trim().toLowerCase();
    filtered = filtered.filter((ad) => {
      const adId = ad.adId?.toLowerCase() || '';
      const title = ad.title?.toLowerCase() || '';
      return adId.includes(search) || title.includes(search);
    });
  }

  return successResponse(res, 200, 'User advertisements fetched successfully', {
    advertisements: filtered.map((ad) => toUserPayload(ad)),
    counts,
    filterCounts
  });
});

export const getMyUserAdvertisementById = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisement(req.user._id, req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  return successResponse(res, 200, 'User advertisement fetched successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const cancelMyPendingUserAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisement(req.user._id, req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  if (advertisement.status !== 'pending') {
    return errorResponse(res, 400, 'Only pending request can be cancelled');
  }

  await safeDeleteCloudinary(advertisement.bannerPublicId);
  await UserAdvertisement.deleteOne({ _id: advertisement._id });

  return successResponse(res, 200, 'User advertisement request cancelled successfully');
});

export const createUserAdvertisementPaymentOrder = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisement(req.user._id, req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  if (!['approved', 'payment_pending'].includes(advertisement.status)) {
    return errorResponse(res, 400, 'Payment is only allowed after admin approval');
  }

  if (advertisement.paymentStatus === 'paid') {
    return errorResponse(res, 400, 'Advertisement payment is already completed');
  }

  const amount = Number(advertisement.totalAmount || 0);
  if (!amount || amount <= 0) {
    return errorResponse(res, 400, 'Invalid advertisement amount');
  }

  if (advertisement.razorpay?.orderId) {
    if (advertisement.status === 'approved') {
      advertisement.status = 'payment_pending';
      await advertisement.save();
    }

    return successResponse(res, 200, 'User advertisement payment order fetched successfully', {
      advertisement: toUserPayload(advertisement),
      payment: {
        orderId: advertisement.razorpay.orderId,
        amount: Math.round(amount * 100),
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        reused: true
      }
    });
  }

  try {
    const order = await createOrder({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `uad_${advertisement._id.toString().slice(-10)}_${Date.now()}`,
      notes: {
        type: 'user_advertisement',
        userAdvertisementId: advertisement._id.toString(),
        adId: advertisement.adId,
        userId: req.user._id.toString(),
        userName: req.user.name || ''
      }
    });

    advertisement.status = 'payment_pending';
    advertisement.paymentStatus = 'unpaid';
    advertisement.razorpay.orderId = order.id;
    appendPaymentLog(advertisement, {
      status: 'initiated',
      orderId: order.id,
      message: 'Payment order created'
    });
    await advertisement.save();

    return successResponse(res, 200, 'User advertisement payment order created successfully', {
      advertisement: toUserPayload(advertisement),
      payment: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    advertisement.paymentStatus = 'failed';
    appendPaymentLog(advertisement, {
      status: 'failed',
      orderId: advertisement.razorpay?.orderId || '',
      message: error.message || 'Failed to create payment order'
    });
    await advertisement.save();
    return errorResponse(res, 400, error.message || 'Failed to create payment order');
  }
});

export const verifyUserAdvertisementPayment = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisement(req.user._id, req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  if (!['approved', 'payment_pending', 'active'].includes(advertisement.status)) {
    return errorResponse(res, 400, 'Advertisement is not ready for payment');
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse(res, 400, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
  }

  if (advertisement.paymentStatus === 'paid') {
    if (advertisement.razorpay?.paymentId === razorpay_payment_id) {
      return successResponse(res, 200, 'User advertisement payment already verified', {
        advertisement: toUserPayload(advertisement)
      });
    }
    return errorResponse(res, 400, 'Advertisement payment is already verified');
  }

  if (advertisement.razorpay?.orderId && advertisement.razorpay.orderId !== razorpay_order_id) {
    try {
      const paymentDetails = await fetchPayment(razorpay_payment_id);
      const paymentOrderId = String(paymentDetails?.order_id || '');
      const noteAdvertisementId = String(paymentDetails?.notes?.userAdvertisementId || '');
      const noteAdId = String(paymentDetails?.notes?.adId || '');
      const noteUserId = String(paymentDetails?.notes?.userId || '');
      const isSameAdvertisement =
        noteAdvertisementId === advertisement._id.toString() ||
        (noteAdId && noteAdId === String(advertisement.adId || ''));

      if (!isSameAdvertisement || paymentOrderId !== String(razorpay_order_id) || noteUserId !== String(req.user._id)) {
        advertisement.paymentStatus = 'failed';
        appendPaymentLog(advertisement, {
          status: 'failed',
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          message: 'Invalid order reference for this advertisement'
        });
        await advertisement.save();
        return errorResponse(res, 400, 'Invalid order reference for this advertisement');
      }
    } catch (error) {
      advertisement.paymentStatus = 'failed';
      appendPaymentLog(advertisement, {
        status: 'failed',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        message: 'Invalid order reference for this advertisement'
      });
      await advertisement.save();
      return errorResponse(res, 400, 'Invalid order reference for this advertisement');
    }
  }

  const isValid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    advertisement.paymentStatus = 'failed';
    appendPaymentLog(advertisement, {
      status: 'failed',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      message: 'Invalid payment signature'
    });
    await advertisement.save();
    return errorResponse(res, 400, 'Invalid payment signature');
  }

  const rawStartDate = parseDate(advertisement.startDate);
  const rawEndDate = parseDate(advertisement.endDate);
  if (!rawStartDate || !rawEndDate) {
    return errorResponse(res, 400, 'Advertisement startDate and endDate must be set before payment');
  }

  const { startDate, endDate } = normalizeDateRange({
    startDate: rawStartDate,
    endDate: rawEndDate
  });

  if (startDate > endDate) {
    return errorResponse(res, 400, 'Advertisement date range is invalid');
  }

  if (endDate < startOfToday()) {
    return errorResponse(res, 400, 'Advertisement duration has already expired');
  }

  const durationDays = calculateDurationDays({ startDate, endDate });
  if (durationDays <= 0 || durationDays > 365) {
    return errorResponse(res, 400, 'Advertisement date range must be between 1 and 365 days');
  }

  const hasConflict = await hasPositionConflict({
    position: advertisement.position,
    startDate,
    endDate,
    excludeId: advertisement._id
  });

  if (hasConflict) {
    advertisement.paymentStatus = 'failed';
    appendPaymentLog(advertisement, {
      status: 'failed',
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      message: 'Selected banner position is already occupied for this date range'
    });
    await advertisement.save();
    return errorResponse(res, 409, 'Selected banner position is already occupied for this date range');
  }

  advertisement.paymentStatus = 'paid';
  advertisement.status = 'active';
  advertisement.isActive = true;
  advertisement.startDate = startDate;
  advertisement.endDate = endDate;
  advertisement.durationDays = durationDays;
  advertisement.paymentId = razorpay_payment_id;
  advertisement.razorpay = {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    paidAt: new Date()
  };
  appendPaymentLog(advertisement, {
    status: 'verified',
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    message: 'Payment verified successfully'
  });

  await advertisement.save();

  return successResponse(res, 200, 'User advertisement payment verified successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const listAdminUserAdvertisements = asyncHandler(async (req, res) => {
  const { status = 'all', userId, q } = req.query;
  const query = { isDeleted: false };

  if (userId && isValidObjectId(userId)) {
    query.userId = userId;
  }

  const ads = await UserAdvertisement.find(query)
    .populate('userId', 'name email phone')
    .sort({ createdAt: -1 })
    .lean();

  const counts = computeCounts(ads);
  let filtered = ads;
  const normalizedStatus = String(status || 'all').toLowerCase();

  if (normalizedStatus !== 'all') {
    filtered = filtered.filter((ad) => effectiveStatus(ad) === normalizedStatus || ad.status === normalizedStatus);
  }

  if (q) {
    const search = String(q).trim().toLowerCase();
    filtered = filtered.filter((ad) => {
      const adId = ad.adId?.toLowerCase() || '';
      const title = ad.title?.toLowerCase() || '';
      const userName = ad.userId?.name?.toLowerCase() || '';
      const userEmail = ad.userId?.email?.toLowerCase() || '';
      return adId.includes(search) || title.includes(search) || userName.includes(search) || userEmail.includes(search);
    });
  }

  return successResponse(res, 200, 'Admin user advertisements fetched successfully', {
    advertisements: filtered.map((ad) => toUserPayload(ad, { includeUser: true })),
    counts
  });
});

export const getAdminUserAdvertisementById = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id).populate('userId', 'name email phone');
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  return successResponse(res, 200, 'Admin user advertisement fetched successfully', {
    advertisement: toUserPayload(advertisement, { includeUser: true })
  });
});

export const getAdminUserAdvertisementPricing = asyncHandler(async (req, res) => {
  const pricePerDay = await getUserAdvertisementPricePerDay();
  return successResponse(res, 200, 'Admin user advertisement pricing fetched successfully', {
    pricePerDay
  });
});

export const updateAdminUserAdvertisementPricing = asyncHandler(async (req, res) => {
  const parsedPrice = Number(req.body?.pricePerDay);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return errorResponse(res, 400, 'pricePerDay must be a positive number');
  }

  const pricePerDay = await upsertUserAdvertisementPricePerDay({
    pricePerDay: Number(parsedPrice.toFixed(2)),
    adminId: req.admin?._id || null
  });

  return successResponse(res, 200, 'User advertisement price per day updated successfully', {
    pricePerDay
  });
});

export const approveUserAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  if (advertisement.status !== 'pending') {
    return errorResponse(res, 400, 'Only pending user advertisement can be approved');
  }

  const requestedPosition = req.body?.position ? normalizePosition(req.body.position) : null;
  if (req.body?.position && !requestedPosition) {
    return errorResponse(res, 400, 'Invalid banner position');
  }

  advertisement.status = 'approved';
  advertisement.rejectionReason = '';
  advertisement.adminNote = String(req.body?.adminNote || '').trim();
  advertisement.reviewedAt = new Date();
  advertisement.reviewedBy = req.admin?._id || null;
  advertisement.approvedAt = new Date();
  if (requestedPosition) {
    advertisement.position = requestedPosition;
  }

  await advertisement.save();

  return successResponse(res, 200, 'User advertisement approved successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const rejectUserAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  if (['active', 'expired'].includes(advertisement.status)) {
    return errorResponse(res, 400, 'Active or expired advertisement cannot be rejected');
  }

  const reason = String(req.body?.reason || '').trim();
  advertisement.status = 'rejected';
  advertisement.isActive = false;
  advertisement.rejectionReason = reason;
  advertisement.adminNote = String(req.body?.adminNote || '').trim();
  advertisement.reviewedAt = new Date();
  advertisement.reviewedBy = req.admin?._id || null;

  await advertisement.save();

  return successResponse(res, 200, 'User advertisement rejected successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const setUserAdvertisementPosition = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  const position = normalizePosition(req.body?.position);
  if (!position) {
    return errorResponse(res, 400, 'Valid banner position is required');
  }

  if (advertisement.status === 'active' && advertisement.startDate && advertisement.endDate) {
    const hasConflict = await hasPositionConflict({
      position,
      startDate: advertisement.startDate,
      endDate: advertisement.endDate,
      excludeId: advertisement._id
    });

    if (hasConflict) {
      return errorResponse(res, 409, 'Selected banner position is already occupied for this date range');
    }
  }

  advertisement.position = position;
  await advertisement.save();

  return successResponse(res, 200, 'User advertisement position updated successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const setUserAdvertisementStatusByAdmin = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  const allowedStatuses = new Set(['pending', 'approved', 'payment_pending', 'active', 'expired', 'rejected']);
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!allowedStatuses.has(status)) {
    return errorResponse(res, 400, 'Valid status is required');
  }

  if (status === 'active' && advertisement.paymentStatus !== 'paid') {
    return errorResponse(res, 400, 'Cannot activate advertisement before payment');
  }

  advertisement.status = status;
  advertisement.adminNote = String(req.body?.adminNote || '').trim();
  advertisement.reviewedAt = new Date();
  advertisement.reviewedBy = req.admin?._id || null;

  if (status === 'approved') {
    advertisement.approvedAt = advertisement.approvedAt || new Date();
    advertisement.isActive = false;
  }

  if (status === 'payment_pending') {
    advertisement.approvedAt = advertisement.approvedAt || new Date();
    advertisement.isActive = false;
  }

  if (status === 'active') {
    const rawStartDate = parseDate(advertisement.startDate);
    const rawEndDate = parseDate(advertisement.endDate);
    if (!rawStartDate || !rawEndDate) {
      return errorResponse(res, 400, 'startDate and endDate are required before activating this advertisement');
    }

    const { startDate, endDate } = normalizeDateRange({
      startDate: rawStartDate,
      endDate: rawEndDate
    });

    if (startDate > endDate) {
      return errorResponse(res, 400, 'Advertisement date range is invalid');
    }

    const durationDays = calculateDurationDays({ startDate, endDate });
    if (durationDays <= 0 || durationDays > 365) {
      return errorResponse(res, 400, 'Advertisement date range must be between 1 and 365 days');
    }

    const hasConflict = await hasPositionConflict({
      position: advertisement.position,
      startDate,
      endDate,
      excludeId: advertisement._id
    });

    if (hasConflict) {
      return errorResponse(res, 409, 'Selected banner position is already occupied for this date range');
    }

    advertisement.startDate = startDate;
    advertisement.endDate = endDate;
    advertisement.durationDays = durationDays;
    advertisement.isActive = true;
  } else {
    advertisement.isActive = false;
  }

  if (status === 'expired') {
    advertisement.isActive = false;
  }

  if (status === 'rejected') {
    advertisement.rejectionReason = String(req.body?.reason || '').trim();
  }

  await advertisement.save();

  return successResponse(res, 200, 'User advertisement status updated successfully', {
    advertisement: toUserPayload(advertisement)
  });
});

export const deleteUserAdvertisementByAdmin = asyncHandler(async (req, res) => {
  const advertisement = await findUserAdvertisementByIdentifier(req.params.id);
  if (!advertisement) {
    return errorResponse(res, 404, 'User advertisement not found');
  }

  await safeDeleteCloudinary(advertisement.bannerPublicId);
  await UserAdvertisement.deleteOne({ _id: advertisement._id });

  return successResponse(res, 200, 'User advertisement deleted successfully');
});

export const listPublicActiveUserAdvertisements = asyncHandler(async (req, res) => {
  const now = new Date();
  const ads = await UserAdvertisement.find({
    isDeleted: false,
    status: 'active',
    paymentStatus: 'paid',
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  })
    .populate('userId', 'name')
    .sort({ position: 1, createdAt: -1 })
    .lean();

  return successResponse(res, 200, 'Public active user advertisements fetched successfully', {
    advertisements: ads.map((ad) => ({
      id: ad._id,
      adId: ad.adId,
      title: ad.title,
      bannerImage: ad.bannerImage,
      position: ad.position,
      startDate: ad.startDate,
      endDate: ad.endDate,
      user: ad.userId
        ? {
          id: ad.userId._id,
          name: ad.userId.name || ''
        }
        : null
    }))
  });
});

export const getOpenUserAdvertisementStatuses = () => OPEN_USER_ADVERTISEMENT_STATUSES;
