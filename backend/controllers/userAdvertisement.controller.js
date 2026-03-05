import mongoose from 'mongoose';
import UserAdvertisement from '../models/UserAdvertisement.js';
import AdvertisementSetting from '../models/AdvertisementSetting.js';
import RazorpayWebhookEvent from '../models/RazorpayWebhookEvent.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryService.js';
import { createOrder, verifyPayment, fetchPayment } from '../services/razorpayService.js';
import { getEnvVar, getRazorpayCredentials } from '../utils/envService.js';
import crypto from 'crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ADVERTISEMENT_SETTING_KEY = 'user_banner_pricing';
const DEFAULT_USER_ADVERTISEMENT_PRICE_PER_DAY = Number(
  process.env.USER_ADVERTISEMENT_PRICE_PER_DAY || process.env.ADVERTISEMENT_PRICE_PER_DAY || 150
);
const ALLOWED_POSITIONS = new Set(['home_top', 'home_middle', 'home_bottom']);
const OPEN_USER_ADVERTISEMENT_STATUSES = ['pending', 'approved', 'payment_pending', 'active'];
const USER_ADVERTISEMENT_WEBHOOK_EVENTS = new Set(['payment.captured', 'order.paid', 'payment.failed']);
const BANNER_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const BANNER_MIN_WIDTH = 1200;
const BANNER_MIN_HEIGHT = 500;
const BANNER_ASPECT_RATIO_TARGET = 2.4;
const BANNER_ASPECT_RATIO_TOLERANCE = 0.15;

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const isBannerAspectRatioValid = (width, height) => {
  if (!width || !height) return false;
  const ratio = Number(width) / Number(height);
  const minRatio = BANNER_ASPECT_RATIO_TARGET * (1 - BANNER_ASPECT_RATIO_TOLERANCE);
  const maxRatio = BANNER_ASPECT_RATIO_TARGET * (1 + BANNER_ASPECT_RATIO_TOLERANCE);
  return ratio >= minRatio && ratio <= maxRatio;
};

const getUserAdvertisementWebhookSecret = async () => {
  const secretFromEnvStore = await getEnvVar('RAZORPAY_WEBHOOK_SECRET', '');
  return String(secretFromEnvStore || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
};

const isWebhookSignatureValid = ({ rawBody, signature, secret }) => {
  if (!rawBody || !signature || !secret) return false;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const signatureBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  );
};

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

const normalizeWebsiteUrl = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
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

const getDefaultBookingWindow = () => {
  const startDate = startOfTomorrow();
  const endDate = endOfDay(new Date(startDate.getTime() + 365 * DAY_MS));
  return { startDate, endDate };
};

const parseBookedDateWindowFromQuery = (query = {}) => {
  const defaultWindow = getDefaultBookingWindow();
  const parsedStartDate = parseDate(query.startDate);
  const parsedEndDate = parseDate(query.endDate);
  const startDate = startOfDay(parsedStartDate || defaultWindow.startDate);
  const endDate = endOfDay(parsedEndDate || defaultWindow.endDate);
  if (startDate > endDate) return null;
  return { startDate, endDate };
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
  const status = String(ad.status || '').toLowerCase();

  if (['approved', 'payment_pending', 'active'].includes(status)) {
    if (endDate && endDate < now) return 'expired';
  }

  if (status === 'active') {
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
    websiteUrl: ad.websiteUrl || '',
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

  if (Number(file.size || 0) > BANNER_MAX_FILE_SIZE_BYTES) {
    throw new Error('Banner file size must be 2MB or less');
  }

  const uploaded = await uploadToCloudinary(file.buffer, {
    folder: 'appzeto/user-advertisements/banners',
    resource_type: 'image'
  });

  const width = Number(uploaded.width || 0);
  const height = Number(uploaded.height || 0);

  if (width < BANNER_MIN_WIDTH || height < BANNER_MIN_HEIGHT) {
    await safeDeleteCloudinary(uploaded.public_id);
    throw new Error(`Banner dimensions too small. Minimum ${BANNER_MIN_WIDTH}x${BANNER_MIN_HEIGHT} required`);
  }

  if (!isBannerAspectRatioValid(width, height)) {
    await safeDeleteCloudinary(uploaded.public_id);
    throw new Error('Banner aspect ratio must be around 2.4:1 (for example 1200x500)');
  }

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

const hasOverlappingUserBannerDateRange = async ({ userId, startDate, endDate, excludeId = null }) => {
  if (!userId || !startDate || !endDate) return null;

  const query = {
    userId,
    isDeleted: false,
    status: 'active',
    paymentStatus: 'paid',
    isActive: true,
    startDate: { $type: 'date', $lte: endDate },
    endDate: { $type: 'date', $gte: startDate }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return UserAdvertisement.findOne(query)
    .select('_id adId title websiteUrl startDate endDate status paymentStatus position');
};

const hasUserScheduleConflict = async ({ userId, startDate, endDate, excludeId = null }) => {
  if (!userId || !startDate || !endDate) return false;

  const query = {
    userId,
    isDeleted: false,
    status: 'active',
    paymentStatus: 'paid',
    isActive: true,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const overlapping = await UserAdvertisement.findOne(query).select('_id');
  return Boolean(overlapping);
};

const toBookedDateRangePayload = (ad, source) => {
  return {
    source,
    id: ad._id,
    adId: ad.adId || '',
    title: ad.title || '',
    startDate: ad.startDate || null,
    endDate: ad.endDate || ad.validityDate || null,
    status: ad.status || '',
    paymentStatus: ad.paymentStatus || '',
    position: source === 'user_advertisement' ? (ad.position || '') : ''
  };
};

const extractUserAdvertisementWebhookContext = (payload = {}) => {
  const paymentEntity = payload?.payload?.payment?.entity || null;
  const orderEntity = payload?.payload?.order?.entity || null;
  const notes = paymentEntity?.notes || orderEntity?.notes || {};

  const orderId = String(paymentEntity?.order_id || orderEntity?.id || '').trim();
  const paymentId = String(paymentEntity?.id || '').trim();
  const userAdvertisementId = String(notes?.userAdvertisementId || '').trim();
  const adId = String(notes?.adId || '').trim();
  const userId = String(notes?.userId || '').trim();
  const paymentDate = paymentEntity?.created_at
    ? new Date(Number(paymentEntity.created_at) * 1000)
    : new Date();
  const failureMessage = String(
    paymentEntity?.error_description ||
    paymentEntity?.description ||
    orderEntity?.status ||
    'Payment failed'
  ).trim();

  return {
    orderId,
    paymentId,
    notes,
    userAdvertisementId,
    adId,
    userId,
    paymentDate,
    failureMessage
  };
};

const resolveUserAdvertisementFromWebhook = async (context = {}) => {
  let advertisement = null;

  if (context.orderId) {
    advertisement = await UserAdvertisement.findOne({
      isDeleted: false,
      'razorpay.orderId': context.orderId
    });
  }

  if (!advertisement && context.userAdvertisementId && isValidObjectId(context.userAdvertisementId)) {
    advertisement = await UserAdvertisement.findOne({
      _id: context.userAdvertisementId,
      isDeleted: false
    });
  }

  if (!advertisement && context.adId) {
    advertisement = await UserAdvertisement.findOne({
      adId: context.adId,
      isDeleted: false
    });
  }

  if (!advertisement) return null;

  if (context.userId && String(advertisement.userId || '') !== String(context.userId)) {
    return null;
  }

  return advertisement;
};

const applyUserAdvertisementWebhookSuccess = async ({ advertisement, context, eventType }) => {
  if (!advertisement) {
    return { status: 'ignored', message: 'User advertisement not found for webhook context' };
  }

  await ensureStatusFreshness(advertisement);

  if (advertisement.paymentStatus === 'paid') {
    return { status: 'processed', message: 'User advertisement payment already verified' };
  }

  if (!['approved', 'payment_pending', 'active'].includes(advertisement.status)) {
    return { status: 'ignored', message: 'User advertisement is not ready for payment' };
  }

  if (context.orderId && advertisement.razorpay?.orderId && String(advertisement.razorpay.orderId) !== context.orderId) {
    return { status: 'ignored', message: 'Webhook order ID does not match user advertisement order ID' };
  }

  const rawStartDate = parseDate(advertisement.startDate);
  const rawEndDate = parseDate(advertisement.endDate);
  if (!rawStartDate || !rawEndDate) {
    return { status: 'ignored', message: 'Advertisement date range is missing' };
  }

  const { startDate, endDate } = normalizeDateRange({
    startDate: rawStartDate,
    endDate: rawEndDate
  });

  if (startDate > endDate) {
    return { status: 'ignored', message: 'Advertisement date range is invalid' };
  }

  if (endDate < startOfToday()) {
    advertisement.status = 'expired';
    advertisement.isActive = false;
    await advertisement.save();
    return { status: 'ignored', message: 'Advertisement range has already expired' };
  }

  const durationDays = calculateDurationDays({ startDate, endDate });
  if (durationDays <= 0 || durationDays > 365) {
    return { status: 'ignored', message: 'Advertisement date range must be between 1 and 365 days' };
  }

  const hasConflict = await hasUserScheduleConflict({
    userId: advertisement.userId,
    startDate,
    endDate,
    excludeId: advertisement._id
  });

  if (hasConflict) {
    advertisement.paymentStatus = 'failed';
    appendPaymentLog(advertisement, {
      status: 'failed',
      orderId: context.orderId,
      paymentId: context.paymentId,
      message: 'Date range overlaps with your existing active or scheduled advertisement',
      raw: { source: 'webhook', eventType }
    });
    await advertisement.save();
    return { status: 'ignored', message: 'Date range overlaps with existing active/scheduled advertisement' };
  }

  advertisement.paymentStatus = 'paid';
  advertisement.status = 'active';
  advertisement.isActive = true;
  advertisement.startDate = startDate;
  advertisement.endDate = endDate;
  advertisement.durationDays = durationDays;
  advertisement.paymentId = context.paymentId || advertisement.paymentId || '';
  advertisement.razorpay = {
    orderId: context.orderId || advertisement.razorpay?.orderId || '',
    paymentId: context.paymentId || advertisement.razorpay?.paymentId || '',
    signature: advertisement.razorpay?.signature || '',
    paidAt: context.paymentDate || new Date()
  };
  appendPaymentLog(advertisement, {
    status: 'verified',
    orderId: context.orderId,
    paymentId: context.paymentId,
    message: `Payment verified successfully via webhook (${eventType})`,
    raw: { source: 'webhook', eventType }
  });
  await advertisement.save();

  return {
    status: 'processed',
    message: `User advertisement payment reconciled via webhook (${eventType})`
  };
};

const applyUserAdvertisementWebhookFailure = async ({ advertisement, context }) => {
  if (!advertisement) {
    return { status: 'ignored', message: 'User advertisement not found for failed payment webhook' };
  }

  if (advertisement.paymentStatus === 'paid') {
    return { status: 'ignored', message: 'User advertisement already paid; ignoring failed payment webhook' };
  }

  if (context.orderId && advertisement.razorpay?.orderId && String(advertisement.razorpay.orderId) !== context.orderId) {
    return { status: 'ignored', message: 'Failed webhook order does not match user advertisement order' };
  }

  advertisement.paymentStatus = 'failed';
  advertisement.isActive = false;
  appendPaymentLog(advertisement, {
    status: 'failed',
    orderId: context.orderId,
    paymentId: context.paymentId,
    message: context.failureMessage || 'Payment failed',
    raw: { source: 'webhook', eventType: 'payment.failed' }
  });
  await advertisement.save();

  return {
    status: 'processed',
    message: context.failureMessage || 'User advertisement payment failed'
  };
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

export const getMyAdvertisementBookedDates = asyncHandler(async (req, res) => {
  const bookingWindow = parseBookedDateWindowFromQuery(req.query);
  if (!bookingWindow) {
    return errorResponse(res, 400, 'startDate cannot be after endDate');
  }

  const { startDate, endDate } = bookingWindow;
  const userAds = await UserAdvertisement.find({
    userId: req.user._id,
    isDeleted: false,
    status: 'active',
    paymentStatus: 'paid',
    isActive: true,
    startDate: { $type: 'date', $lte: endDate },
    endDate: { $type: 'date', $gte: startDate }
  })
    .sort({ startDate: 1, createdAt: 1 })
    .select('_id adId title startDate endDate status paymentStatus position');

  return successResponse(res, 200, 'Booked advertisement date ranges fetched successfully', {
    startDate,
    endDate,
    bookedRanges: userAds.map((ad) => toBookedDateRangePayload(ad, 'user_advertisement'))
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
  const websiteUrl = normalizeWebsiteUrl(req.body.websiteUrl);
  if (!websiteUrl) {
    return errorResponse(res, 400, 'Valid websiteUrl is required');
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

  const overlappingBanner = await hasOverlappingUserBannerDateRange({
    userId: req.user._id,
    startDate,
    endDate
  });

  if (overlappingBanner) {
    return errorResponse(
      res,
      409,
      'Dates overlap with an existing banner. Choose different dates.',
      { advertisement: toUserPayload(overlappingBanner) }
    );
  }

  const uploadedBanner = await uploadBanner(req.file);
  const pricePerDay = await getUserAdvertisementPricePerDay();
  const totalAmount = calculateTotalAmount(durationDays, pricePerDay);

  const advertisement = await UserAdvertisement.create({
    userId: req.user._id,
    bannerImage: uploadedBanner.url,
    bannerPublicId: uploadedBanner.publicId,
    title,
    websiteUrl,
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

  if (advertisement.status === 'expired') {
    return errorResponse(res, 400, 'Advertisement duration has already expired');
  }

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

  const { keyId } = await getRazorpayCredentials();
  const checkoutKeyId = keyId || process.env.RAZORPAY_KEY_ID || '';
  if (!checkoutKeyId) {
    return errorResponse(res, 500, 'Payment gateway key is not configured');
  }

  const existingOrderId = String(advertisement.razorpay?.orderId || '');
  const shouldReuseExistingOrder = Boolean(existingOrderId) && !existingOrderId.startsWith('order_mock_');

  if (shouldReuseExistingOrder) {
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
        keyId: checkoutKeyId,
        reused: true
      }
    });
  }

  // Drop stale mock order IDs generated by old mock logic and create a fresh real order.
  if (existingOrderId && existingOrderId.startsWith('order_mock_')) {
    advertisement.razorpay.orderId = '';
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
        keyId: checkoutKeyId
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

  const hasConflict = await hasUserScheduleConflict({
    userId: req.user._id,
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
      message: 'Date range overlaps with your existing active or scheduled advertisement'
    });
    await advertisement.save();
    return errorResponse(res, 409, 'Date range overlaps with your existing active or scheduled advertisement');
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

export const handleUserAdvertisementPaymentWebhook = async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = String(req.headers['x-razorpay-signature'] || '');
  const eventType = String(req.body?.event || '');
  const incomingEventId = String(req.headers['x-razorpay-event-id'] || '').trim();
  const context = extractUserAdvertisementWebhookContext(req.body || {});
  const fallbackEventId = [
    eventType || 'unknown',
    context.orderId || 'na',
    context.paymentId || 'na',
    req.body?.created_at || Date.now()
  ].join(':');
  const eventId = `user_ad:${incomingEventId || fallbackEventId}`;

  let webhookEvent = null;
  try {
    webhookEvent = await RazorpayWebhookEvent.findOne({ eventId });
    if (webhookEvent && ['processed', 'ignored'].includes(webhookEvent.status)) {
      return successResponse(res, 200, 'Webhook already processed');
    }

    if (!webhookEvent) {
      webhookEvent = await RazorpayWebhookEvent.create({
        eventId,
        eventType: eventType || 'unknown',
        status: 'processing',
        attempts: 1,
        payload: req.body || null
      });
    } else {
      webhookEvent.status = 'processing';
      webhookEvent.attempts = Number(webhookEvent.attempts || 0) + 1;
      webhookEvent.errorMessage = '';
      webhookEvent.payload = req.body || null;
      await webhookEvent.save();
    }

    const webhookSecret = await getUserAdvertisementWebhookSecret();
    if (!webhookSecret) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = 'Webhook secret not configured';
      await webhookEvent.save();
      return errorResponse(res, 500, 'Webhook secret is not configured');
    }

    const validSignature = isWebhookSignatureValid({
      rawBody,
      signature,
      secret: webhookSecret
    });

    if (!validSignature) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = 'Invalid webhook signature';
      await webhookEvent.save();
      return errorResponse(res, 400, 'Invalid webhook signature');
    }

    if (!USER_ADVERTISEMENT_WEBHOOK_EVENTS.has(eventType)) {
      webhookEvent.status = 'ignored';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (unsupported event)');
    }

    if (!context.orderId && !context.userAdvertisementId && !context.adId) {
      webhookEvent.status = 'ignored';
      webhookEvent.errorMessage = 'Missing user advertisement reference in webhook payload';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (missing user advertisement reference)');
    }

    const advertisement = await resolveUserAdvertisementFromWebhook(context);

    const result = eventType === 'payment.failed'
      ? await applyUserAdvertisementWebhookFailure({ advertisement, context })
      : await applyUserAdvertisementWebhookSuccess({ advertisement, context, eventType });

    webhookEvent.status = ['processed', 'ignored'].includes(result.status) ? result.status : 'processed';
    webhookEvent.errorMessage = result.status === 'ignored' ? String(result.message || '') : '';
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return successResponse(res, 200, result.message || 'User advertisement webhook processed successfully');
  } catch (error) {
    if (webhookEvent) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = error.message || 'Webhook processing failed';
      await webhookEvent.save();
    }
    return errorResponse(res, 500, 'Failed to process user advertisement webhook');
  }
};

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

  const nextPosition = requestedPosition || advertisement.position;
  const parsedStartDate = parseDate(advertisement.startDate);
  const parsedEndDate = parseDate(advertisement.endDate);

  if (parsedStartDate && parsedEndDate) {
    const { startDate, endDate } = normalizeDateRange({
      startDate: parsedStartDate,
      endDate: parsedEndDate
    });

    const overlappingBanner = await hasOverlappingUserBannerDateRange({
      userId: advertisement.userId,
      startDate,
      endDate,
      excludeId: advertisement._id
    });

    if (overlappingBanner) {
      return errorResponse(
        res,
        409,
        'Dates overlap with an existing banner. Choose different dates.',
        { advertisement: toUserPayload(overlappingBanner) }
      );
    }
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

    const hasConflict = await hasUserScheduleConflict({
      userId: advertisement.userId,
      startDate,
      endDate,
      excludeId: advertisement._id
    });

    if (hasConflict) {
      return errorResponse(res, 409, 'Date range overlaps with user active or scheduled advertisement');
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
      websiteUrl: ad.websiteUrl || '',
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
