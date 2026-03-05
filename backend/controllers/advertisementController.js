import mongoose from 'mongoose';
import Advertisement from '../models/Advertisement.js';
import AdvertisementSetting from '../models/AdvertisementSetting.js';
import RazorpayWebhookEvent from '../models/RazorpayWebhookEvent.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinaryService.js';
import { createOrder, verifyPayment, fetchPayment } from '../services/razorpayService.js';
import { getEnvVar, getRazorpayCredentials } from '../utils/envService.js';
import crypto from 'crypto';

const ALLOWED_CATEGORIES = new Set([
  'Video Promotion',
  'Restaurant Promotion',
  'Image Promotion',
  'Banner Promotion'
]);

const DEFAULT_ADVERTISEMENT_PRICE_PER_DAY = Number(process.env.ADVERTISEMENT_PRICE_PER_DAY || 150);
const ADVERTISEMENT_SETTING_KEY = 'restaurant_banner_pricing';
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_BANNER_STATUSES = ['pending', 'payment_pending', 'active', 'approved', 'paused'];
const ADVERTISEMENT_WEBHOOK_EVENTS = new Set(['payment.captured', 'order.paid', 'payment.failed']);
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

const getAdvertisementWebhookSecret = async () => {
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

const parseDate = (value) => {
  if (!value) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsedLocalDate = new Date(year, month - 1, day);
    if (Number.isNaN(parsedLocalDate.getTime())) return null;
    return parsedLocalDate;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfTomorrow = () => {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
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

const getDefaultPricePerDay = () => {
  if (!Number.isFinite(DEFAULT_ADVERTISEMENT_PRICE_PER_DAY) || DEFAULT_ADVERTISEMENT_PRICE_PER_DAY <= 0) {
    return 150;
  }
  return Number(DEFAULT_ADVERTISEMENT_PRICE_PER_DAY.toFixed(2));
};

const calculatePrice = (durationDays, pricePerDay = getDefaultPricePerDay()) => {
  return Number((durationDays * pricePerDay).toFixed(2));
};

const calculateDurationDays = ({ startDate, endDate }) => {
  const normalized = normalizeDateRange({ startDate, endDate });
  const difference = normalized.endDate.getTime() - normalized.startDate.getTime();
  return Math.floor(difference / DAY_MS) + 1;
};

const isBannerAdvertisement = (ad) => ad?.adType === 'restaurant_banner';

const effectiveStatus = (ad, now = new Date()) => {
  const endDate = ad.endDate ? new Date(ad.endDate) : null;
  const validityDate = ad.validityDate ? new Date(ad.validityDate) : null;
  const startDate = ad.startDate ? new Date(ad.startDate) : null;

  if (isBannerAdvertisement(ad)) {
    if (OPEN_BANNER_STATUSES.includes(ad.status) && endDate && endDate < now) {
      return 'expired';
    }
    if (ad.status === 'active' && startDate && startDate > now) {
      return 'scheduled';
    }
    return ad.status;
  }

  if (validityDate && validityDate < now) {
    return 'expired';
  }

  if (ad.status === 'approved') {
    if (!startDate || startDate <= now) {
      return 'running';
    }
    return 'approved';
  }

  return ad.status;
};

const toMedia = (media) => {
  if (!media || !media.url) return null;
  return {
    url: media.url,
    publicId: media.publicId || '',
    resourceType: media.resourceType || '',
    originalName: media.originalName || '',
    size: media.size || 0
  };
};

const toAdvertisementPayload = (ad, options = {}) => {
  const currentEffectiveStatus = effectiveStatus(ad);
  const now = new Date();
  const parsedStartDate = ad.startDate ? new Date(ad.startDate) : null;
  const parsedEndDate = ad.endDate ? new Date(ad.endDate) : (ad.validityDate ? new Date(ad.validityDate) : null);
  const isLiveNow = Boolean(
    isBannerAdvertisement(ad) &&
    ad.status === 'active' &&
    ad.paymentStatus === 'paid' &&
    parsedStartDate &&
    parsedEndDate &&
    parsedStartDate <= now &&
    parsedEndDate >= now
  );
  const payload = {
    id: ad._id,
    adId: ad.adId,
    adType: ad.adType || 'legacy',
    category: ad.category,
    title: ad.title,
    description: ad.description,
    fileDescription: ad.fileDescription || '',
    videoDescription: ad.videoDescription || '',
    status: ad.status,
    effectiveStatus: currentEffectiveStatus,
    priority: ad.priority ?? null,
    paymentStatus: ad.paymentStatus || 'unpaid',
    pauseNote: ad.pauseNote || '',
    rejectionReason: ad.rejectionReason || '',
    adminNote: ad.adminNote || '',
    startDate: ad.startDate,
    endDate: ad.endDate || ad.validityDate || null,
    validityDate: ad.validityDate,
    durationDays: ad.durationDays || null,
    pricePerDay: ad.pricePerDay || 0,
    price: ad.price || 0,
    bannerImage: ad.bannerImage || ad.fileMedia?.url || '',
    bannerMeta: ad.bannerMeta || null,
    approvalDate: ad.approvalDate || null,
    approvedBy: ad.approvedBy || ad.reviewedBy || null,
    duration: {
      start: ad.startDate,
      end: ad.endDate || ad.validityDate || null
    },
    fileMedia: toMedia(ad.fileMedia),
    videoMedia: toMedia(ad.videoMedia),
    razorpay: {
      orderId: ad.razorpay?.orderId || '',
      paymentId: ad.razorpay?.paymentId || '',
      paidAt: ad.razorpay?.paidAt || null
    },
    canPay: ['payment_pending', 'approved'].includes(ad.status) && ad.paymentStatus === 'unpaid',
    isLiveNow,
    isScheduled: currentEffectiveStatus === 'scheduled',
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt
  };

  if (options.includeRestaurant) {
    payload.restaurant = ad.restaurant
      ? {
        id: ad.restaurant._id,
        name: ad.restaurant.name || '',
        email: ad.restaurant.email || ad.restaurant.ownerEmail || ''
      }
      : null;
  }

  return payload;
};

const parseBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const safeDeleteCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await deleteFromCloudinary(publicId);
  } catch (error) {
    console.warn(`[Campaign] Failed to delete Cloudinary media: ${publicId}`, error.message);
  }
};

const hardDeleteAdvertisement = async (advertisement) => {
  await safeDeleteCloudinary(advertisement.fileMedia?.publicId);
  await safeDeleteCloudinary(advertisement.videoMedia?.publicId);
  await safeDeleteCloudinary(advertisement.bannerPublicId);
  await Advertisement.deleteOne({ _id: advertisement._id });
};

const uploadMediaIfPresent = async (file, options) => {
  if (!file?.buffer) return null;
  const uploaded = await uploadToCloudinary(file.buffer, options);
  return {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    resourceType: uploaded.resource_type,
    originalName: file.originalname || '',
    size: file.size || 0
  };
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
    folder: 'appzeto/advertisements/banners',
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
    publicId: uploaded.public_id,
    width,
    height,
    originalName: file.originalname || '',
    size: file.size || 0
  };
};

const findRestaurantAdvertisement = async (restaurantId, identifier) => {
  const filter = { restaurant: restaurantId, isDeleted: false };

  if (isValidObjectId(identifier)) {
    filter.$or = [{ _id: identifier }, { adId: identifier }];
  } else {
    filter.adId = identifier;
  }

  return Advertisement.findOne(filter);
};

const findAdvertisementByIdentifier = async (identifier) => {
  const filter = { isDeleted: false };

  if (isValidObjectId(identifier)) {
    filter.$or = [{ _id: identifier }, { adId: identifier }];
  } else {
    filter.adId = identifier;
  }

  return Advertisement.findOne(filter);
};

const ensureStatusFreshness = async (ad) => {
  const currentEffectiveStatus = effectiveStatus(ad);
  if (currentEffectiveStatus === 'expired' && ad.status !== 'expired') {
    ad.status = 'expired';
    await ad.save();
  }
};

const computeCounts = (ads) => {
  const base = {
    all: ads.length,
    pending: 0,
    running: 0,
    approved: 0,
    payment_pending: 0,
    scheduled: 0,
    active: 0,
    paused: 0,
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

const hasOverlappingActiveAd = async ({ restaurantId, startDate, endDate, excludeId = null }) => {
  const query = {
    restaurant: restaurantId,
    adType: 'restaurant_banner',
    status: 'active',
    paymentStatus: 'paid',
    isDeleted: false,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const overlapping = await Advertisement.findOne(query).select('_id');
  return !!overlapping;
};

const hasOverlappingBannerDateRange = async ({ restaurantId, startDate, endDate, excludeId = null }) => {
  const query = {
    restaurant: restaurantId,
    adType: 'restaurant_banner',
    status: 'active',
    paymentStatus: 'paid',
    isDeleted: false,
    startDate: { $type: 'date', $lte: endDate },
    endDate: { $type: 'date', $gte: startDate }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const overlapping = await Advertisement.findOne(query).select('_id adId startDate endDate status paymentStatus');
  return overlapping;
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

const extractAdvertisementWebhookContext = (payload = {}) => {
  const paymentEntity = payload?.payload?.payment?.entity || null;
  const orderEntity = payload?.payload?.order?.entity || null;
  const notes = paymentEntity?.notes || orderEntity?.notes || {};

  const orderId = String(paymentEntity?.order_id || orderEntity?.id || '').trim();
  const paymentId = String(paymentEntity?.id || '').trim();
  const advertisementId = String(notes?.advertisementId || '').trim();
  const adId = String(notes?.adId || '').trim();
  const restaurantId = String(notes?.restaurantId || '').trim();
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
    advertisementId,
    adId,
    restaurantId,
    paymentDate,
    failureMessage
  };
};

const resolveAdvertisementFromWebhook = async (context = {}) => {
  let advertisement = null;

  if (context.orderId) {
    advertisement = await Advertisement.findOne({
      isDeleted: false,
      'razorpay.orderId': context.orderId
    });
  }

  if (!advertisement && context.advertisementId && isValidObjectId(context.advertisementId)) {
    advertisement = await Advertisement.findOne({
      _id: context.advertisementId,
      isDeleted: false
    });
  }

  if (!advertisement && context.adId) {
    advertisement = await Advertisement.findOne({
      adId: context.adId,
      isDeleted: false
    });
  }

  if (!advertisement) return null;

  if (context.restaurantId && String(advertisement.restaurant || '') !== String(context.restaurantId)) {
    return null;
  }

  if (!isBannerAdvertisement(advertisement)) {
    return null;
  }

  return advertisement;
};

const applyAdvertisementWebhookSuccess = async ({ advertisement, context, eventType }) => {
  if (!advertisement) {
    return { status: 'ignored', message: 'Advertisement not found for webhook context' };
  }

  await ensureStatusFreshness(advertisement);

  if (advertisement.paymentStatus === 'paid') {
    return { status: 'processed', message: 'Advertisement payment already verified' };
  }

  if (!['approved', 'payment_pending', 'active'].includes(advertisement.status)) {
    return { status: 'ignored', message: 'Advertisement is not ready for payment' };
  }

  if (context.orderId && advertisement.razorpay?.orderId && String(advertisement.razorpay.orderId) !== context.orderId) {
    return { status: 'ignored', message: 'Webhook order ID does not match advertisement order ID' };
  }

  const rawStartDate = parseDate(advertisement.startDate);
  const rawEndDate = parseDate(advertisement.endDate || advertisement.validityDate);
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
    await advertisement.save();
    return { status: 'ignored', message: 'Advertisement range has already expired' };
  }

  const hasOverlap = await hasOverlappingActiveAd({
    restaurantId: advertisement.restaurant,
    startDate,
    endDate,
    excludeId: advertisement._id
  });

  if (hasOverlap) {
    return { status: 'ignored', message: 'Overlapping active advertisement exists for this date range' };
  }

  advertisement.paymentStatus = 'paid';
  advertisement.status = 'active';
  advertisement.startDate = startDate;
  advertisement.endDate = endDate;
  advertisement.durationDays = calculateDurationDays({ startDate, endDate });
  advertisement.validityDate = endDate;
  advertisement.razorpay = {
    orderId: context.orderId || advertisement.razorpay?.orderId || '',
    paymentId: context.paymentId || advertisement.razorpay?.paymentId || '',
    signature: advertisement.razorpay?.signature || '',
    paidAt: context.paymentDate || new Date()
  };
  await advertisement.save();

  return {
    status: 'processed',
    message: `Advertisement payment reconciled via webhook (${eventType})`
  };
};

const applyAdvertisementWebhookFailure = async ({ advertisement, context }) => {
  if (!advertisement) {
    return { status: 'ignored', message: 'Advertisement not found for failed payment webhook' };
  }

  if (advertisement.paymentStatus === 'paid') {
    return { status: 'ignored', message: 'Advertisement already paid; ignoring failed payment webhook' };
  }

  if (context.orderId && advertisement.razorpay?.orderId && String(advertisement.razorpay.orderId) !== context.orderId) {
    return { status: 'ignored', message: 'Failed webhook order does not match advertisement order' };
  }

  if (advertisement.status === 'approved') {
    advertisement.status = 'payment_pending';
    await advertisement.save();
  }

  return {
    status: 'processed',
    message: context.failureMessage || 'Advertisement payment failed'
  };
};

const getAdvertisementPricePerDay = async () => {
  const setting = await AdvertisementSetting.findOne({ key: ADVERTISEMENT_SETTING_KEY }).select('pricePerDay').lean();
  const price = Number(setting?.pricePerDay);
  if (!Number.isFinite(price) || price <= 0) {
    return getDefaultPricePerDay();
  }
  return Number(price.toFixed(2));
};

const upsertAdvertisementPricePerDay = async ({ pricePerDay, adminId = null }) => {
  const updated = await AdvertisementSetting.findOneAndUpdate(
    { key: ADVERTISEMENT_SETTING_KEY },
    {
      $set: {
        key: ADVERTISEMENT_SETTING_KEY,
        pricePerDay: Number(pricePerDay),
        updatedBy: adminId || null
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return Number(updated.pricePerDay || getDefaultPricePerDay());
};

const getOpenBannerRequestStatuses = () => OPEN_BANNER_STATUSES;

const findCurrentOpenBannerRequest = async (restaurantId) => {
  await Advertisement.updateMany(
    {
      restaurant: restaurantId,
      adType: 'restaurant_banner',
      isDeleted: false,
      status: { $in: OPEN_BANNER_STATUSES },
      endDate: { $lt: startOfToday() }
    },
    { $set: { status: 'expired' } }
  );

  return Advertisement.findOne({
    restaurant: restaurantId,
    adType: 'restaurant_banner',
    isDeleted: false,
    status: { $in: getOpenBannerRequestStatuses() }
  }).sort({ createdAt: -1 });
};

export const getAdvertisementPricing = asyncHandler(async (req, res) => {
  const pricePerDay = await getAdvertisementPricePerDay();
  return successResponse(res, 200, 'Advertisement pricing fetched successfully', {
    pricePerDay
  });
});

export const getRestaurantCurrentBannerAdvertisement = asyncHandler(async (req, res) => {
  const currentAdvertisement = await findCurrentOpenBannerRequest(req.restaurant._id);
  return successResponse(res, 200, 'Current banner advertisement status fetched successfully', {
    advertisement: currentAdvertisement ? toAdvertisementPayload(currentAdvertisement) : null
  });
});

export const getRestaurantBannerBookedDates = asyncHandler(async (req, res) => {
  const bookingWindow = parseBookedDateWindowFromQuery(req.query);
  if (!bookingWindow) {
    return errorResponse(res, 400, 'startDate cannot be after endDate');
  }

  const { startDate, endDate } = bookingWindow;
  const restaurantAds = await Advertisement.find({
    restaurant: req.restaurant._id,
    adType: 'restaurant_banner',
    status: 'active',
    paymentStatus: 'paid',
    isDeleted: false,
    startDate: { $type: 'date', $lte: endDate },
    endDate: { $type: 'date', $gte: startDate }
  })
    .sort({ startDate: 1, createdAt: 1 })
    .select('_id adId title startDate endDate validityDate status paymentStatus');

  return successResponse(res, 200, 'Booked advertisement date ranges fetched successfully', {
    startDate,
    endDate,
    bookedRanges: restaurantAds.map((ad) => toBookedDateRangePayload(ad, 'restaurant_advertisement'))
  });
});

export const getAdminAdvertisementPricing = asyncHandler(async (req, res) => {
  const pricePerDay = await getAdvertisementPricePerDay();
  return successResponse(res, 200, 'Admin advertisement pricing fetched successfully', {
    pricePerDay
  });
});

export const updateAdminAdvertisementPricing = asyncHandler(async (req, res) => {
  const parsedPrice = Number(req.body?.pricePerDay);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return errorResponse(res, 400, 'pricePerDay must be a positive number');
  }

  const pricePerDay = await upsertAdvertisementPricePerDay({
    pricePerDay: Number(parsedPrice.toFixed(2)),
    adminId: req.admin?._id || null
  });

  return successResponse(res, 200, 'Advertisement price per day updated successfully', {
    pricePerDay
  });
});

export const listRestaurantAdvertisements = asyncHandler(async (req, res) => {
  const { status = 'all', category, q } = req.query;

  const query = {
    restaurant: req.restaurant._id,
    isDeleted: false
  };

  if (category && ALLOWED_CATEGORIES.has(category)) {
    query.category = category;
  }

  const ads = await Advertisement.find(query).sort({ createdAt: -1 }).lean();
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
      return adId.includes(search) || title.includes(search);
    });
  }

  return successResponse(res, 200, 'Advertisements retrieved successfully', {
    advertisements: filtered.map((ad) => toAdvertisementPayload(ad)),
    counts
  });
});

export const getRestaurantAdvertisementById = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  return successResponse(res, 200, 'Advertisement retrieved successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const createRestaurantAdvertisement = asyncHandler(async (req, res) => {
  const {
    category,
    title,
    description,
    fileDescription = '',
    videoDescription = '',
    validityDate,
    startDate
  } = req.body;

  if (!category || !ALLOWED_CATEGORIES.has(category)) {
    return errorResponse(res, 400, 'Valid category is required');
  }

  if (!title || String(title).trim().length === 0) {
    return errorResponse(res, 400, 'Title is required');
  }

  if (!description || String(description).trim().length === 0) {
    return errorResponse(res, 400, 'Description is required');
  }

  const parsedValidityDate = parseDate(validityDate);
  if (!parsedValidityDate) {
    return errorResponse(res, 400, 'Valid validityDate is required');
  }

  if (parsedValidityDate < startOfToday()) {
    return errorResponse(res, 400, 'Validity date must be today or later');
  }

  const parsedStartDate = parseDate(startDate) || new Date();
  if (parsedStartDate > parsedValidityDate) {
    return errorResponse(res, 400, 'Start date cannot be after validity date');
  }

  const fileUpload = req.files?.file?.[0] || null;
  const videoUpload = req.files?.video?.[0] || null;

  const uploadedFile = await uploadMediaIfPresent(fileUpload, {
    folder: 'appzeto/advertisements/files',
    resource_type: 'auto'
  });

  const uploadedVideo = await uploadMediaIfPresent(videoUpload, {
    folder: 'appzeto/advertisements/videos',
    resource_type: 'video'
  });

  const advertisement = await Advertisement.create({
    adType: 'legacy',
    restaurant: req.restaurant._id,
    category,
    title: String(title).trim(),
    description: String(description).trim(),
    fileDescription: String(fileDescription || '').trim(),
    videoDescription: String(videoDescription || '').trim(),
    validityDate: parsedValidityDate,
    startDate: parsedStartDate,
    endDate: parsedValidityDate,
    status: 'pending',
    paymentStatus: 'unpaid',
    fileMedia: uploadedFile,
    videoMedia: uploadedVideo
  });

  return successResponse(res, 201, 'Advertisement created successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const createRestaurantBannerAdvertisement = asyncHandler(async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 400, 'Banner image is required');
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

  const overlappingBanner = await hasOverlappingBannerDateRange({
    restaurantId: req.restaurant._id,
    startDate,
    endDate
  });

  if (overlappingBanner) {
    return errorResponse(
      res,
      409,
      'Dates overlap with an existing banner. Choose different dates.',
      { advertisement: toAdvertisementPayload(overlappingBanner) }
    );
  }

  let uploadedBanner;
  try {
    uploadedBanner = await uploadBanner(req.file);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to upload banner image');
  }

  const pricePerDay = await getAdvertisementPricePerDay();
  const price = calculatePrice(durationDays, pricePerDay);
  const restaurantName = String(req.restaurant?.name || '').trim();
  const requestedTitle = String(req.body.title || '').trim();
  const title = requestedTitle || restaurantName;

  if (!title) {
    return errorResponse(res, 400, 'Title is required');
  }

  const description = restaurantName || title;

  const advertisement = await Advertisement.create({
    adType: 'restaurant_banner',
    restaurant: req.restaurant._id,
    category: 'Banner Promotion',
    title,
    description,
    durationDays,
    pricePerDay,
    price,
    status: 'pending',
    paymentStatus: 'unpaid',
    startDate,
    endDate,
    validityDate: endDate,
    bannerImage: uploadedBanner.url,
    bannerPublicId: uploadedBanner.publicId,
    bannerMeta: {
      width: uploadedBanner.width,
      height: uploadedBanner.height,
      originalName: uploadedBanner.originalName,
      size: uploadedBanner.size
    },
    fileMedia: {
      url: uploadedBanner.url,
      publicId: uploadedBanner.publicId,
      resourceType: 'image',
      originalName: uploadedBanner.originalName,
      size: uploadedBanner.size
    }
  });

  return successResponse(res, 201, 'Advertisement request submitted successfully', {
    advertisement: toAdvertisementPayload(advertisement),
    pricing: {
      pricePerDay,
      durationDays,
      startDate,
      endDate,
      totalPrice: price
    }
  });
});

export const updateRestaurantAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  const updatableFields = ['category', 'title', 'description', 'fileDescription', 'videoDescription', 'validityDate', 'startDate'];
  let hasCreativeChanges = false;

  for (const field of updatableFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

    if (field === 'category') {
      if (!ALLOWED_CATEGORIES.has(req.body.category)) {
        return errorResponse(res, 400, 'Invalid category');
      }
      advertisement.category = req.body.category;
      hasCreativeChanges = true;
      continue;
    }

    if (field === 'validityDate') {
      const parsed = parseDate(req.body.validityDate);
      if (!parsed) {
        return errorResponse(res, 400, 'Invalid validityDate');
      }
      if (parsed < startOfToday()) {
        return errorResponse(res, 400, 'Validity date must be today or later');
      }
      advertisement.validityDate = parsed;
      advertisement.endDate = parsed;
      hasCreativeChanges = true;
      continue;
    }

    if (field === 'startDate') {
      const parsed = parseDate(req.body.startDate);
      if (!parsed) {
        return errorResponse(res, 400, 'Invalid startDate');
      }
      advertisement.startDate = parsed;
      hasCreativeChanges = true;
      continue;
    }

    if (field === 'title') {
      const value = String(req.body.title || '').trim();
      if (!value) {
        return errorResponse(res, 400, 'Title is required');
      }
      advertisement.title = value;
      hasCreativeChanges = true;
      continue;
    }

    if (field === 'description') {
      const value = String(req.body.description || '').trim();
      if (!value) {
        return errorResponse(res, 400, 'Description is required');
      }
      advertisement.description = value;
      hasCreativeChanges = true;
      continue;
    }

    advertisement[field] = String(req.body[field] || '').trim();
    hasCreativeChanges = true;
  }

  if (advertisement.startDate && advertisement.validityDate && advertisement.startDate > advertisement.validityDate) {
    return errorResponse(res, 400, 'Start date cannot be after validity date');
  }

  if (isBannerAdvertisement(advertisement)) {
    const rawStartDate = parseDate(advertisement.startDate);
    const rawEndDate = parseDate(advertisement.endDate || advertisement.validityDate);

    if (!rawStartDate || !rawEndDate) {
      return errorResponse(res, 400, 'Valid startDate and endDate are required for banner advertisements');
    }

    const normalizedRange = normalizeDateRange({ startDate: rawStartDate, endDate: rawEndDate });
    if (normalizedRange.startDate > normalizedRange.endDate) {
      return errorResponse(res, 400, 'Banner advertisement date range is invalid');
    }

    if (normalizedRange.startDate < startOfTomorrow()) {
      return errorResponse(res, 400, 'startDate must be tomorrow or later');
    }

    const overlappingBanner = await hasOverlappingBannerDateRange({
      restaurantId: req.restaurant._id,
      startDate: normalizedRange.startDate,
      endDate: normalizedRange.endDate,
      excludeId: advertisement._id
    });

    if (overlappingBanner) {
      return errorResponse(
        res,
        409,
        'Dates overlap with an existing banner. Choose different dates.',
        { advertisement: toAdvertisementPayload(overlappingBanner) }
      );
    }

    advertisement.startDate = normalizedRange.startDate;
    advertisement.endDate = normalizedRange.endDate;
    advertisement.validityDate = normalizedRange.endDate;
    advertisement.durationDays = calculateDurationDays(normalizedRange);
    advertisement.pricePerDay = await getAdvertisementPricePerDay();
    advertisement.price = calculatePrice(advertisement.durationDays, advertisement.pricePerDay);
  }

  const removeFile = parseBoolean(req.body.removeFile);
  const removeVideo = parseBoolean(req.body.removeVideo);
  const newFile = req.files?.file?.[0] || null;
  const newVideo = req.files?.video?.[0] || null;

  if (removeFile) {
    await safeDeleteCloudinary(advertisement.fileMedia?.publicId);
    advertisement.fileMedia = null;
    hasCreativeChanges = true;
  }

  if (removeVideo) {
    await safeDeleteCloudinary(advertisement.videoMedia?.publicId);
    advertisement.videoMedia = null;
    hasCreativeChanges = true;
  }

  if (newFile) {
    const uploaded = await uploadMediaIfPresent(newFile, {
      folder: 'appzeto/advertisements/files',
      resource_type: 'auto'
    });
    await safeDeleteCloudinary(advertisement.fileMedia?.publicId);
    advertisement.fileMedia = uploaded;
    hasCreativeChanges = true;
  }

  if (newVideo) {
    const uploaded = await uploadMediaIfPresent(newVideo, {
      folder: 'appzeto/advertisements/videos',
      resource_type: 'video'
    });
    await safeDeleteCloudinary(advertisement.videoMedia?.publicId);
    advertisement.videoMedia = uploaded;
    hasCreativeChanges = true;
  }

  if (hasCreativeChanges && ['approved', 'paused', 'payment_pending', 'active'].includes(advertisement.status)) {
    advertisement.status = 'pending';
    advertisement.rejectionReason = '';
    advertisement.adminNote = '';
    advertisement.reviewedAt = null;
    advertisement.reviewedBy = null;
    advertisement.approvedBy = null;
    advertisement.approvalDate = null;

    if (isBannerAdvertisement(advertisement)) {
      advertisement.paymentStatus = 'unpaid';
      advertisement.razorpay = {
        orderId: '',
        paymentId: '',
        signature: '',
        paidAt: null
      };
    }
  }

  await advertisement.save();

  return successResponse(res, 200, 'Advertisement updated successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const updateRestaurantAdvertisementStatus = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  const { action, pauseNote = '' } = req.body;

  if (!action || !['pause', 'resume'].includes(action)) {
    return errorResponse(res, 400, 'Valid action (pause/resume) is required');
  }

  if (action === 'pause') {
    const currentEffectiveStatus = effectiveStatus(advertisement);
    if (!['running', 'approved', 'active'].includes(currentEffectiveStatus)) {
      return errorResponse(res, 400, 'Only approved/running/active advertisements can be paused');
    }
    advertisement.status = 'paused';
    advertisement.pauseNote = String(pauseNote || '').trim();
  }

  if (action === 'resume') {
    if (advertisement.status !== 'paused') {
      return errorResponse(res, 400, 'Only paused advertisements can be resumed');
    }

    if (isBannerAdvertisement(advertisement)) {
      if (advertisement.endDate && advertisement.endDate < new Date()) {
        advertisement.status = 'expired';
      } else {
        advertisement.status = advertisement.paymentStatus === 'paid' ? 'active' : 'payment_pending';
      }
    } else if (advertisement.validityDate < new Date()) {
      advertisement.status = 'expired';
    } else {
      advertisement.status = 'approved';
    }
  }

  await advertisement.save();

  return successResponse(res, 200, 'Advertisement status updated successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const duplicateRestaurantAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  if (isBannerAdvertisement(advertisement)) {
    return errorResponse(res, 400, 'Banner advertisements cannot be duplicated. Please create a new banner request.');
  }

  const duplicateStartDate = new Date();
  const duplicateValidityDate =
    advertisement.validityDate && new Date(advertisement.validityDate) > duplicateStartDate
      ? new Date(advertisement.validityDate)
      : new Date(duplicateStartDate.getTime() + 30 * DAY_MS);

  const clonedAdvertisement = await Advertisement.create({
    adType: advertisement.adType || 'legacy',
    restaurant: advertisement.restaurant,
    category: advertisement.category,
    title: `${advertisement.title} (Copy)`,
    description: advertisement.description,
    fileDescription: advertisement.fileDescription,
    videoDescription: advertisement.videoDescription,
    startDate: duplicateStartDate,
    endDate: duplicateValidityDate,
    validityDate: duplicateValidityDate,
    status: 'pending',
    paymentStatus: 'unpaid',
    durationDays: null,
    pricePerDay: 0,
    price: 0,
    bannerImage: '',
    bannerPublicId: '',
    bannerMeta: null,
    fileMedia: null,
    videoMedia: null
  });

  return successResponse(res, 201, 'Advertisement duplicated successfully', {
    advertisement: toAdvertisementPayload(clonedAdvertisement)
  });
});

export const deleteRestaurantAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await hardDeleteAdvertisement(advertisement);

  return successResponse(res, 200, 'Advertisement deleted successfully');
});

export const createAdvertisementPaymentOrder = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  if (!isBannerAdvertisement(advertisement)) {
    return errorResponse(res, 400, 'Payment flow is only available for banner advertisements');
  }

  if (!['payment_pending', 'approved'].includes(advertisement.status)) {
    return errorResponse(res, 400, 'Payment is only allowed after admin approval');
  }

  if (advertisement.paymentStatus === 'paid') {
    return errorResponse(res, 400, 'Advertisement payment is already completed');
  }

  const amount = Number(advertisement.price || 0);
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

    return successResponse(res, 200, 'Advertisement payment order fetched successfully', {
      advertisement: toAdvertisementPayload(advertisement),
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

  const order = await createOrder({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: `ad_${advertisement._id.toString().slice(-10)}_${Date.now()}`,
    notes: {
      type: 'advertisement',
      advertisementId: advertisement._id.toString(),
      adId: advertisement.adId,
      restaurantId: req.restaurant._id.toString(),
      restaurantName: req.restaurant.name || ''
    }
  });

  if (advertisement.status === 'approved') {
    advertisement.status = 'payment_pending';
  }

  advertisement.razorpay.orderId = order.id;
  await advertisement.save();

  return successResponse(res, 200, 'Advertisement payment order created successfully', {
    advertisement: toAdvertisementPayload(advertisement),
    payment: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: checkoutKeyId
    }
  });
});

export const verifyAdvertisementPayment = asyncHandler(async (req, res) => {
  const advertisement = await findRestaurantAdvertisement(req.restaurant._id, req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  if (!isBannerAdvertisement(advertisement)) {
    return errorResponse(res, 400, 'Payment verification is only available for banner advertisements');
  }

  if (!['payment_pending', 'approved', 'active'].includes(advertisement.status)) {
    return errorResponse(res, 400, 'Advertisement is not ready for payment');
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse(res, 400, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
  }

  if (advertisement.paymentStatus === 'paid') {
    if (advertisement.razorpay?.paymentId === razorpay_payment_id) {
      return successResponse(res, 200, 'Advertisement payment already verified', {
        advertisement: toAdvertisementPayload(advertisement)
      });
    }
    return errorResponse(res, 400, 'Advertisement payment is already verified');
  }

  if (advertisement.razorpay?.orderId && advertisement.razorpay.orderId !== razorpay_order_id) {
    try {
      const paymentDetails = await fetchPayment(razorpay_payment_id);
      const paymentOrderId = String(paymentDetails?.order_id || '');
      const noteAdvertisementId = String(paymentDetails?.notes?.advertisementId || '');
      const noteAdId = String(paymentDetails?.notes?.adId || '');
      const isSameAdvertisement =
        noteAdvertisementId === advertisement._id.toString() ||
        (noteAdId && noteAdId === String(advertisement.adId || ''));

      if (!isSameAdvertisement || paymentOrderId !== String(razorpay_order_id)) {
        return errorResponse(res, 400, 'Invalid order reference for this advertisement');
      }
    } catch (error) {
      return errorResponse(res, 400, 'Invalid order reference for this advertisement');
    }
  }

  const isValid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    return errorResponse(res, 400, 'Invalid payment signature');
  }

  const rawStartDate = parseDate(advertisement.startDate);
  const rawEndDate = parseDate(advertisement.endDate || advertisement.validityDate);

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
    return errorResponse(res, 400, 'This advertisement date range has already ended');
  }

  const hasOverlap = await hasOverlappingActiveAd({
    restaurantId: advertisement.restaurant,
    startDate,
    endDate,
    excludeId: advertisement._id
  });

  if (hasOverlap) {
    return errorResponse(res, 409, 'An active advertisement already exists for overlapping dates');
  }

  advertisement.paymentStatus = 'paid';
  advertisement.status = 'active';
  advertisement.startDate = startDate;
  advertisement.endDate = endDate;
  advertisement.durationDays = calculateDurationDays({ startDate, endDate });
  advertisement.validityDate = endDate;
  advertisement.razorpay = {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    paidAt: new Date()
  };

  await advertisement.save();

  return successResponse(res, 200, 'Advertisement payment verified successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const handleAdvertisementPaymentWebhook = async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = String(req.headers['x-razorpay-signature'] || '');
  const eventType = String(req.body?.event || '');
  const incomingEventId = String(req.headers['x-razorpay-event-id'] || '').trim();
  const context = extractAdvertisementWebhookContext(req.body || {});
  const fallbackEventId = [
    eventType || 'unknown',
    context.orderId || 'na',
    context.paymentId || 'na',
    req.body?.created_at || Date.now()
  ].join(':');
  const eventId = `campaign_ad:${incomingEventId || fallbackEventId}`;

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

    const webhookSecret = await getAdvertisementWebhookSecret();
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

    if (!ADVERTISEMENT_WEBHOOK_EVENTS.has(eventType)) {
      webhookEvent.status = 'ignored';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (unsupported event)');
    }

    if (!context.orderId && !context.advertisementId && !context.adId) {
      webhookEvent.status = 'ignored';
      webhookEvent.errorMessage = 'Missing advertisement reference in webhook payload';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (missing advertisement reference)');
    }

    const advertisement = await resolveAdvertisementFromWebhook(context);

    const result = eventType === 'payment.failed'
      ? await applyAdvertisementWebhookFailure({ advertisement, context })
      : await applyAdvertisementWebhookSuccess({ advertisement, context, eventType });

    webhookEvent.status = ['processed', 'ignored'].includes(result.status) ? result.status : 'processed';
    webhookEvent.errorMessage = result.status === 'ignored' ? String(result.message || '') : '';
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return successResponse(res, 200, result.message || 'Advertisement webhook processed successfully');
  } catch (error) {
    if (webhookEvent) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = error.message || 'Webhook processing failed';
      await webhookEvent.save();
    }
    return errorResponse(res, 500, 'Failed to process advertisement webhook');
  }
};

export const listAdminAdvertisements = asyncHandler(async (req, res) => {
  const { status = 'all', category, restaurantId, q } = req.query;

  const query = { isDeleted: false };

  if (category && ALLOWED_CATEGORIES.has(category)) {
    query.category = category;
  }

  if (restaurantId && isValidObjectId(restaurantId)) {
    query.restaurant = restaurantId;
  }

  const ads = await Advertisement.find(query)
    .populate('restaurant', 'name email ownerEmail')
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
      const restaurantName = ad.restaurant?.name?.toLowerCase() || '';
      return adId.includes(search) || title.includes(search) || restaurantName.includes(search);
    });
  }

  return successResponse(res, 200, 'Advertisements retrieved successfully', {
    advertisements: filtered.map((ad) => toAdvertisementPayload(ad, { includeRestaurant: true })),
    counts
  });
});

export const getAdminAdvertisementById = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id).populate('restaurant', 'name email ownerEmail');

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await ensureStatusFreshness(advertisement);

  return successResponse(res, 200, 'Advertisement retrieved successfully', {
    advertisement: toAdvertisementPayload(advertisement, { includeRestaurant: true })
  });
});

export const approveAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  const { priority = null, adminNote = '' } = req.body;

  if (priority !== null && priority !== '' && Number(priority) > 0) {
    advertisement.priority = Number(priority);
  }

  const reviewedAt = new Date();
  advertisement.rejectionReason = '';
  advertisement.adminNote = String(adminNote || '').trim();
  advertisement.reviewedAt = reviewedAt;
  advertisement.reviewedBy = req.admin?._id || null;

  if (isBannerAdvertisement(advertisement)) {
    const rawStartDate = parseDate(advertisement.startDate);
    const rawEndDate = parseDate(advertisement.endDate || advertisement.validityDate);

    if (!rawStartDate || !rawEndDate) {
      return errorResponse(res, 400, 'Banner advertisement must have valid startDate and endDate before approval');
    }

    const normalizedRange = normalizeDateRange({ startDate: rawStartDate, endDate: rawEndDate });
    if (normalizedRange.startDate > normalizedRange.endDate) {
      return errorResponse(res, 400, 'Banner advertisement date range is invalid');
    }

    advertisement.status = 'payment_pending';
    advertisement.approvalDate = reviewedAt;
    advertisement.approvedBy = req.admin?._id || null;
    advertisement.startDate = normalizedRange.startDate;
    advertisement.endDate = normalizedRange.endDate;
    advertisement.durationDays = calculateDurationDays(normalizedRange);
    advertisement.validityDate = normalizedRange.endDate;

    await advertisement.save();

    return successResponse(res, 200, 'Advertisement approved. Waiting for restaurant payment', {
      advertisement: toAdvertisementPayload(advertisement)
    });
  }

  advertisement.status = 'approved';
  await advertisement.save();

  return successResponse(res, 200, 'Advertisement approved successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const rejectAdvertisement = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  const { reason = '', adminNote = '' } = req.body;

  advertisement.status = 'rejected';
  advertisement.rejectionReason = String(reason || '').trim();
  advertisement.adminNote = String(adminNote || '').trim();
  advertisement.reviewedAt = new Date();
  advertisement.reviewedBy = req.admin?._id || null;

  await advertisement.save();

  return successResponse(res, 200, 'Advertisement rejected successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const setAdvertisementPriority = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  const { priority } = req.body;

  if (priority === undefined || priority === null || Number(priority) <= 0) {
    return errorResponse(res, 400, 'Valid priority is required');
  }

  advertisement.priority = Number(priority);
  await advertisement.save();

  return successResponse(res, 200, 'Priority updated successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const setAdvertisementStatusByAdmin = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  const { status, adminNote = '' } = req.body;
  const allowedStatuses = new Set(['pending', 'approved', 'paused', 'rejected', 'expired', 'payment_pending', 'active']);

  if (!status || !allowedStatuses.has(status)) {
    return errorResponse(res, 400, 'Valid status is required');
  }

  if (isBannerAdvertisement(advertisement) && status === 'active' && advertisement.paymentStatus !== 'paid') {
    return errorResponse(res, 400, 'Cannot activate advertisement before payment');
  }

  advertisement.status = status;
  advertisement.adminNote = String(adminNote || '').trim();
  advertisement.reviewedAt = new Date();
  advertisement.reviewedBy = req.admin?._id || null;

  if (status === 'payment_pending') {
    advertisement.approvalDate = advertisement.approvalDate || new Date();
    advertisement.approvedBy = req.admin?._id || null;
  }

  if (status === 'active' && isBannerAdvertisement(advertisement) && advertisement.paymentStatus === 'paid') {
    const rawStartDate = parseDate(advertisement.startDate);
    const rawEndDate = parseDate(advertisement.endDate || advertisement.validityDate);

    if (!rawStartDate || !rawEndDate) {
      return errorResponse(res, 400, 'startDate and endDate are required before activating this advertisement');
    }

    const normalizedRange = normalizeDateRange({ startDate: rawStartDate, endDate: rawEndDate });
    if (normalizedRange.startDate > normalizedRange.endDate) {
      return errorResponse(res, 400, 'Advertisement date range is invalid');
    }

    advertisement.startDate = normalizedRange.startDate;
    advertisement.endDate = normalizedRange.endDate;
    advertisement.durationDays = calculateDurationDays(normalizedRange);
    advertisement.validityDate = normalizedRange.endDate;

    const hasOverlap = await hasOverlappingActiveAd({
      restaurantId: advertisement.restaurant,
      startDate: advertisement.startDate,
      endDate: advertisement.endDate,
      excludeId: advertisement._id
    });

    if (hasOverlap) {
      return errorResponse(res, 409, 'An active advertisement already exists for overlapping dates');
    }

  }

  await advertisement.save();

  return successResponse(res, 200, 'Advertisement status updated successfully', {
    advertisement: toAdvertisementPayload(advertisement)
  });
});

export const deleteAdvertisementByAdmin = asyncHandler(async (req, res) => {
  const advertisement = await findAdvertisementByIdentifier(req.params.id);

  if (!advertisement) {
    return errorResponse(res, 404, 'Advertisement not found');
  }

  await hardDeleteAdvertisement(advertisement);

  return successResponse(res, 200, 'Advertisement deleted successfully');
});

export const listPublicActiveAdvertisements = asyncHandler(async (req, res) => {
  const now = new Date();

  const ads = await Advertisement.find({
    adType: 'restaurant_banner',
    status: 'active',
    paymentStatus: 'paid',
    isDeleted: false,
    startDate: { $lte: now },
    endDate: { $gte: now }
  })
    .populate('restaurant', 'name')
    .sort({ priority: 1, createdAt: -1 })
    .lean();

  return successResponse(res, 200, 'Active advertisements fetched successfully', {
    advertisements: ads.map((ad) => ({
      id: ad._id,
      adId: ad.adId,
      title: ad.title || ad.restaurant?.name || '',
      bannerImage: ad.bannerImage || ad.fileMedia?.url || '',
      startDate: ad.startDate,
      endDate: ad.endDate || ad.validityDate || null,
      durationDays: ad.durationDays,
      price: ad.price,
      restaurant: ad.restaurant
        ? {
          id: ad.restaurant._id,
          name: ad.restaurant.name || ''
        }
        : null
    }))
  });
});
