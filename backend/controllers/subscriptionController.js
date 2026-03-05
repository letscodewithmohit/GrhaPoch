import Restaurant from '../models/Restaurant.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { createOrder, verifyPayment, fetchPayment } from '../services/razorpayService.js';
import crypto from 'crypto';
import AuditLog from '../models/AuditLog.js';
import RestaurantCommission from '../models/RestaurantCommission.js';
import BusinessSettings from '../models/BusinessSettings.js';
import RestaurantNotification from '../models/RestaurantNotification.js';
import mongoose from 'mongoose';
import SubscriptionPayment from '../models/SubscriptionPayment.js';
import RazorpayWebhookEvent from '../models/RazorpayWebhookEvent.js';
import { getEnvVar, getRazorpayCredentials } from '../utils/envService.js';

const SUBSCRIPTION_WEBHOOK_EVENTS = new Set(['payment.captured', 'order.paid', 'payment.failed']);

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  const stringValue = String(value);
  if (!mongoose.Types.ObjectId.isValid(stringValue)) return null;
  return new mongoose.Types.ObjectId(stringValue);
};

const getWebhookSecret = async () => {
  const secretFromEnvStore = await getEnvVar('RAZORPAY_WEBHOOK_SECRET', '');
  return String(secretFromEnvStore || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
};

const buildSubscriptionDates = ({ restaurant, plan, now = new Date() }) => {
  let startDate = new Date(now);
  let endDate = new Date(now);

  const isRenewing = restaurant.businessModel === 'Subscription Base' &&
  restaurant.subscription?.status === 'active' &&
  restaurant.subscription?.endDate;

  if (isRenewing) {
    startDate = new Date(restaurant.subscription.endDate);
    endDate = new Date(restaurant.subscription.endDate);
  }

  endDate.setMonth(endDate.getMonth() + plan.durationMonths);

  const expectedDay = startDate.getDate();
  if (endDate.getDate() !== expectedDay) {
    endDate.setDate(0);
  }

  return { startDate, endDate, isRenewing };
};

const appendRenewedHistory = ({ restaurant, now }) => {
  if (!restaurant.subscription) return;
  if (!restaurant.subscriptionHistory) {
    restaurant.subscriptionHistory = [];
  }
  restaurant.subscriptionHistory.push({
    planId: restaurant.subscription.planId,
    planName: restaurant.subscription.planName,
    status: 'renewed',
    startDate: restaurant.subscription.startDate,
    endDate: restaurant.subscription.endDate,
    paymentId: restaurant.subscription.paymentId,
    orderId: restaurant.subscription.orderId,
    activatedAt: restaurant.subscription.startDate || now
  });
};

export const activateSubscriptionTx = async ({
  restaurantId,
  planId,
  razorpayOrderId,
  razorpayPaymentId,
  paymentDate = new Date(),
  source = 'verify_api',
  session
}) => {
  const plan = await SubscriptionPlan.findById(planId).session(session);
  if (!plan) {
    throw new Error('Subscription plan not found');
  }

  const restaurant = await Restaurant.findById(restaurantId).session(session);
  if (!restaurant) {
    throw new Error('Restaurant not found');
  }

  const normalizedOrderId = String(razorpayOrderId || '').trim();
  const normalizedPaymentId = String(razorpayPaymentId || '').trim();
  if (!normalizedOrderId) {
    throw new Error('Razorpay order ID is required');
  }

  // Strong idempotency: never process the same Razorpay order twice.
  const existingSuccessfulOrder = await SubscriptionPayment.findOne({
    razorpayOrderId: normalizedOrderId,
    status: 'success'
  }).session(session);
  if (existingSuccessfulOrder) {
    const sameRestaurant = String(existingSuccessfulOrder.restaurantId || '') === String(restaurant._id || '');
    const samePlan = String(existingSuccessfulOrder.planId || '') === String(plan._id || '');

    if (!sameRestaurant || !samePlan) {
      throw new Error('This order is already mapped to a different subscription transaction');
    }

    return { subscription: restaurant.subscription, plan, isAlreadyActive: true };
  }

  if (
  restaurant.subscription?.status === 'active' &&
  String(restaurant.subscription.orderId || '').trim() === normalizedOrderId)
  {
    return { subscription: restaurant.subscription, plan, isAlreadyActive: true };
  }

  if (
  restaurant.subscription?.status === 'active' &&
  normalizedPaymentId &&
  String(restaurant.subscription.paymentId || '').trim() === normalizedPaymentId)
  {
    return { subscription: restaurant.subscription, plan, isAlreadyActive: true };
  }

  const now = new Date(paymentDate || Date.now());
  const { startDate, endDate, isRenewing } = buildSubscriptionDates({ restaurant, plan, now });
  const requiresAdminApproval = !restaurant.isActive;
  const nextSubscriptionStatus = requiresAdminApproval ? 'pending_approval' : 'active';

  if (isRenewing) {
    appendRenewedHistory({ restaurant, now });
  }

  restaurant.subscription = {
    planId: plan._id.toString(),
    planName: plan.name,
    status: nextSubscriptionStatus,
    startDate,
    endDate,
    paymentId: razorpayPaymentId || '',
    orderId: razorpayOrderId
  };
  restaurant.businessModel = 'Subscription Base';
  // Keep newly registered restaurants inactive until admin approval.
  restaurant.isActive = requiresAdminApproval ? false : true;
  await restaurant.save({ session });

  await RestaurantCommission.updateOne(
    { restaurant: restaurant._id },
    {
      $set: {
        'defaultCommission.value': 0,
        'defaultCommission.type': 'percentage'
      }
    },
    { session }
  );

  const paymentFilter = razorpayPaymentId ?
  { $or: [{ razorpayPaymentId }, { razorpayOrderId }] } :
  { razorpayOrderId };

  await SubscriptionPayment.findOneAndUpdate(
    paymentFilter,
    {
      $set: {
        restaurantId: restaurant._id,
        planId: plan._id,
        planName: plan.name,
        amount: plan.price,
        currency: 'INR',
        razorpayPaymentId: razorpayPaymentId || null,
        razorpayOrderId,
        status: 'success',
        paymentDate: now,
        startDate,
        endDate,
        renewalType: isRenewing ? 'renewal' : 'new',
        source,
        lastError: ''
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );

  await AuditLog.create([{
    entityType: 'restaurant',
    entityId: restaurant._id,
    action: 'upgrade_to_subscription',
    actionType: 'update',
    performedBy: {
      type: source === 'verify_api' ? 'restaurant' : 'system',
      userId: source === 'verify_api' ? restaurant._id : 'system',
      name: source === 'verify_api' ? restaurant.name : 'Razorpay Webhook'
    },
    description: `Restaurant upgraded to ${plan.name} subscription`,
    metadata: {
      planId: plan._id.toString(),
      planName: plan.name,
      previousModel: 'Commission Base',
      newModel: 'Subscription Base',
      paymentId: razorpayPaymentId || '',
      source
    }
  }], { session });

  return { subscription: restaurant.subscription, plan, isAlreadyActive: false };
};

export const markSubscriptionPaymentFailed = async ({
  razorpayOrderId,
  razorpayPaymentId,
  message = 'Payment failed',
  source = 'webhook'
}) => {
  const filter = razorpayPaymentId ?
  { $or: [{ razorpayPaymentId }, { razorpayOrderId }] } :
  { razorpayOrderId };

  await SubscriptionPayment.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'failed',
        source,
        lastError: message,
        ...(razorpayPaymentId ? { razorpayPaymentId } : {})
      }
    },
    { new: true }
  );
};

const extractWebhookPaymentContext = (payload) => {
  const paymentEntity = payload?.payload?.payment?.entity || null;
  const orderEntity = payload?.payload?.order?.entity || null;
  const orderId = paymentEntity?.order_id || orderEntity?.id || '';
  const paymentId = paymentEntity?.id || '';
  const notes = paymentEntity?.notes || orderEntity?.notes || {};
  const restaurantId = notes?.restaurantId || '';
  const planId = notes?.planId || '';
  const paymentDate = paymentEntity?.created_at ?
  new Date(Number(paymentEntity.created_at) * 1000) :
  new Date();
  const failureMessage = paymentEntity?.error_description || paymentEntity?.description || 'Payment failed';

  return { orderId, paymentId, notes, restaurantId, planId, paymentDate, failureMessage };
};

// Create Razorpay order for subscription
export const createSubscriptionOrder = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { planId } = req.body;

    if (!planId) {
      return errorResponse(res, 400, 'Plan ID is required');
    }

    // Fetch plan details
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return errorResponse(res, 404, 'Subscription plan not found or inactive');
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Guard: block payment if subscription is still active and not in warning window
    if (
    restaurant.businessModel === 'Subscription Base' &&
    restaurant.subscription?.status === 'active' &&
    restaurant.subscription?.endDate)
    {
      const settings = await BusinessSettings.getSettings();
      const warningDays = settings?.subscriptionExpiryWarningDays || 5;
      const now = new Date();
      const endDate = new Date(restaurant.subscription.endDate);
      const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

      if (daysRemaining > warningDays) {
        return errorResponse(
          res,
          400,
          `You already have an active subscription. You can renew in the last ${warningDays} days before expiry (${daysRemaining} days remaining).`
        );
      }
    }

    const amount = plan.price * 100; // Convert to paise
    const { keyId } = await getRazorpayCredentials();
    if (!keyId) {
      return errorResponse(res, 500, 'Payment gateway key is not configured');
    }

    // Create Razorpay order using centralized service
    const order = await createOrder({
      amount: amount,
      currency: 'INR',
      // Receipt ID must be <= 40 chars. 
      // sub_ (4) + last 10 of restaurantId (10) + _ (1) + Date.now (13) = 28 characters
      receipt: `sub_${restaurantId.toString().slice(-10)}_${Date.now()}`,
      notes: {
        restaurantId: restaurantId.toString(),
        planId: planId,
        restaurantName: restaurant.name,
        type: 'subscription'
      }
    });

    const renewalType =
    restaurant.businessModel === 'Subscription Base' &&
    restaurant.subscription?.status === 'active' &&
    restaurant.subscription?.endDate ?
    'renewal' : 'new';

    await SubscriptionPayment.findOneAndUpdate(
      { razorpayOrderId: order.id },
      {
        $setOnInsert: {
          restaurantId: restaurant._id,
          planId: plan._id,
          planName: plan.name,
          amount: plan.price,
          currency: 'INR',
          razorpayOrderId: order.id,
          status: 'pending',
          paymentDate: new Date(),
          renewalType,
          source: 'create_order',
          lastError: ''
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return successResponse(res, 200, 'Order created successfully', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId
    });
  } catch (error) {
    console.error('Create subscription order error:', error);
    return errorResponse(res, 500, error.message || 'Failed to create order');
  }
};


// Verify payment and activate subscription
export const verifyPaymentAndActivate = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planId) {
      return errorResponse(res, 400, 'razorpay_order_id, razorpay_payment_id, razorpay_signature and planId are required');
    }

    const existingOrderPayment = await SubscriptionPayment.findOne({
      razorpayOrderId: razorpay_order_id,
      status: 'success'
    });
    if (existingOrderPayment) {
      const sameRestaurant = String(existingOrderPayment.restaurantId) === String(restaurantId);
      const samePlan = String(existingOrderPayment.planId) === String(planId);

      if (!sameRestaurant || !samePlan) {
        return errorResponse(res, 409, 'This order is already mapped to a different subscription transaction');
      }

      const alreadyActivatedRestaurant = await Restaurant.findById(restaurantId).select('subscription');
      return successResponse(res, 200, 'Subscription already activated for this order', {
        subscription: alreadyActivatedRestaurant?.subscription || null
      });
    }

    // Prevent replay/reuse of the same payment ID
    const existingPayment = await SubscriptionPayment.findOne({ razorpayPaymentId: razorpay_payment_id });
    if (existingPayment?.status === 'success') {
      const sameRestaurant = String(existingPayment.restaurantId) === String(restaurantId);
      const samePlan = String(existingPayment.planId) === String(planId);
      const sameOrder = String(existingPayment.razorpayOrderId) === String(razorpay_order_id);

      if (!sameRestaurant || !samePlan || !sameOrder) {
        return errorResponse(res, 409, 'This payment is already mapped to a different subscription transaction');
      }

      const alreadyActivatedRestaurant = await Restaurant.findById(restaurantId).select('subscription');
      if (alreadyActivatedRestaurant?.subscription?.paymentId === razorpay_payment_id) {
        return successResponse(res, 200, 'Subscription already activated for this payment', {
          subscription: alreadyActivatedRestaurant.subscription
        });
      }
    }

    // Verify signature using centralized service
    const isValid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      await markSubscriptionPaymentFailed({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        message: 'Invalid payment signature',
        source: 'verify_api'
      });
      return errorResponse(res, 400, 'Invalid payment signature');
    }

    // Fetch plan to determine duration
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return errorResponse(res, 404, 'Subscription plan not found');
    }

    // Payment verified, activate subscription
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    let paymentDetails = null;

    // Validate payment ownership against Razorpay record (skip for mock orders used in local/dev)
    const isMockOrder = String(razorpay_order_id).startsWith('order_mock_');
    if (!isMockOrder) {
      try {
        paymentDetails = await fetchPayment(razorpay_payment_id);
        const paymentOrderId = paymentDetails?.order_id || paymentDetails?.orderId;
        if (paymentOrderId && String(paymentOrderId) !== String(razorpay_order_id)) {
          return errorResponse(res, 400, 'Payment does not belong to the provided order');
        }

        const notes = paymentDetails?.notes || {};
        if (notes.restaurantId && String(notes.restaurantId) !== String(restaurantId)) {
          return errorResponse(res, 400, 'Payment restaurant mismatch');
        }
        if (notes.planId && String(notes.planId) !== String(plan._id)) {
          return errorResponse(res, 400, 'Payment plan mismatch');
        }
      } catch (paymentFetchError) {
        console.error('Failed to fetch payment details for verification:', paymentFetchError);
        await markSubscriptionPaymentFailed({
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          message: 'Unable to validate payment details from Razorpay',
          source: 'verify_api'
        });
        return errorResponse(res, 400, 'Unable to validate payment details from Razorpay');
      }
    }

    const activationDate = paymentDetails?.created_at ?
    new Date(Number(paymentDetails.created_at) * 1000) :
    new Date();

    const session = await mongoose.startSession();
    let activationResult = null;
    try {
      await session.withTransaction(async () => {
        activationResult = await activateSubscriptionTx({
          restaurantId: restaurant._id,
          planId: plan._id,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          paymentDate: activationDate,
          source: 'verify_api',
          session
        });
      });
    } finally {
      await session.endSession();
    }

    const activatedSubscription = activationResult?.subscription || restaurant.subscription;
    const pendingApproval = activatedSubscription?.status === 'pending_approval';
    const successMessage = pendingApproval ?
    'Subscription payment verified. Waiting for admin approval.' :
    'Subscription activated successfully';

    return successResponse(res, 200, successMessage, {
      subscription: activationResult?.subscription || restaurant.subscription
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return errorResponse(res, 500, 'Failed to verify payment');
  }
};

export const handleSubscriptionWebhook = async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const signature = String(req.headers['x-razorpay-signature'] || '');
  const eventType = String(req.body?.event || '');
  const incomingEventId = String(req.headers['x-razorpay-event-id'] || '').trim();

  const fallbackEventId = [
  eventType || 'unknown',
  req.body?.payload?.payment?.entity?.id || req.body?.payload?.order?.entity?.id || 'na',
  req.body?.created_at || Date.now()].
  join(':');
  const eventId = incomingEventId || fallbackEventId;

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
      await webhookEvent.save();
    }

    const webhookSecret = await getWebhookSecret();
    if (!webhookSecret) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = 'Webhook secret not configured';
      await webhookEvent.save();
      return errorResponse(res, 500, 'Webhook secret is not configured');
    }

    const expectedSignature = crypto.
    createHmac('sha256', webhookSecret).
    update(rawBody).
    digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    const isSignatureValid = signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isSignatureValid) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = 'Invalid webhook signature';
      await webhookEvent.save();
      return errorResponse(res, 400, 'Invalid webhook signature');
    }

    if (!SUBSCRIPTION_WEBHOOK_EVENTS.has(eventType)) {
      webhookEvent.status = 'ignored';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (unsupported event)');
    }

    const context = extractWebhookPaymentContext(req.body || {});
    if (!context.orderId) {
      webhookEvent.status = 'ignored';
      webhookEvent.errorMessage = 'Missing order reference in webhook payload';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (missing order reference)');
    }

    let restaurantId = context.restaurantId;
    let planId = context.planId;

    const pendingRecord = await SubscriptionPayment.findOne({ razorpayOrderId: context.orderId });
    if (!restaurantId && pendingRecord?.restaurantId) {
      restaurantId = String(pendingRecord.restaurantId);
    }
    if (!planId && pendingRecord?.planId) {
      planId = String(pendingRecord.planId);
    }

    if (eventType === 'payment.failed') {
      await markSubscriptionPaymentFailed({
        razorpayOrderId: context.orderId,
        razorpayPaymentId: context.paymentId || pendingRecord?.razorpayPaymentId || null,
        message: context.failureMessage || 'Payment failed',
        source: 'webhook'
      });

      webhookEvent.status = 'processed';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook processed (payment failed)');
    }

    const restaurantObjectId = toObjectIdOrNull(restaurantId);
    const planObjectId = toObjectIdOrNull(planId);
    if (!restaurantObjectId || !planObjectId) {
      webhookEvent.status = 'ignored';
      webhookEvent.errorMessage = 'Unable to resolve restaurant/plan from webhook payload';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (missing subscription context)');
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await activateSubscriptionTx({
          restaurantId: restaurantObjectId,
          planId: planObjectId,
          razorpayOrderId: context.orderId,
          razorpayPaymentId: context.paymentId || pendingRecord?.razorpayPaymentId || null,
          paymentDate: context.paymentDate,
          source: 'webhook',
          session
        });
      });
    } finally {
      await session.endSession();
    }

    webhookEvent.status = 'processed';
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return successResponse(res, 200, 'Webhook processed successfully');
  } catch (error) {
    console.error('Subscription webhook error:', error);
    if (webhookEvent) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = error.message || 'Webhook processing failed';
      await webhookEvent.save();
    }
    return errorResponse(res, 500, 'Failed to process webhook');
  }
};

/**
 * Helper to check and expire subscription if end date passed
 * @param {Object} restaurant - Restaurant document (mongoose document)
 * @returns {Promise<Object>} - Updated restaurant document
 */
export const checkSubscriptionExpiry = async (restaurant) => {
  if (restaurant.businessModel === 'Subscription Base' && restaurant.subscription?.status === 'active') {
    const now = new Date();
    const endDate = new Date(restaurant.subscription.endDate);

    if (endDate < now) {


      if (!restaurant.subscriptionHistory) {
        restaurant.subscriptionHistory = [];
      }
      restaurant.subscriptionHistory.push({
        planId: restaurant.subscription.planId,
        planName: restaurant.subscription.planName,
        status: 'expired',
        startDate: restaurant.subscription.startDate,
        endDate: restaurant.subscription.endDate,
        paymentId: restaurant.subscription.paymentId,
        orderId: restaurant.subscription.orderId,
        activatedAt: restaurant.subscription.startDate || now
      });

      restaurant.businessModel = 'Commission Base';
      restaurant.subscription.status = 'expired';

      await restaurant.save();

      // Create audit log
      try {
        await AuditLog.createLog({
          entityType: 'restaurant',
          entityId: restaurant._id,
          action: 'subscription_expired',
          actionType: 'update',
          performedBy: {
            type: 'system',
            userId: 'system',
            name: 'System'
          },
          description: `Subscription expired. Switched to Commission Base.`,
          metadata: {
            previousModel: 'Subscription Base',
            newModel: 'Commission Base'
          }
        });

        // Create persistent notification for the restaurant
        await RestaurantNotification.create({
          restaurant: restaurant._id,
          title: 'Subscription Expired',
          message: 'Your plan has expired. You have been switched to Commission Base. Please subscribe to a plan again to enjoy 0% commission.',
          type: 'subscription_expired'
        });

        // Reset commission to default fallback (10%)
        const commissionUpdateResult = await RestaurantCommission.updateOne(
          { restaurant: restaurant._id },
          {
            $set: {
              "defaultCommission.value": 10, // Default fallback
              "defaultCommission.type": "percentage"
            }
          }
        );
        if (!commissionUpdateResult?.matchedCount) {
          console.warn(`No RestaurantCommission record found for restaurant ${restaurant._id}; skipped fallback commission sync`);
        }

      } catch (logError) {
        console.error('Error logging subscription expiry:', logError);
      }
    }
  }
  return restaurant;
};

// Get subscription status
export const getSubscriptionStatus = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    let restaurant = await Restaurant.findById(restaurantId).select('subscription subscriptionHistory isActive businessModel');

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Check for expiry
    restaurant = await checkSubscriptionExpiry(restaurant);

    let daysRemaining = null;
    let showWarning = false;

    // Fetch the dynamic warning threshold from business settings
    const settings = await BusinessSettings.getSettings();
    const warningDays = settings?.subscriptionExpiryWarningDays || 5;

    if (restaurant.businessModel === 'Subscription Base' && restaurant.subscription?.status === 'active') {
      const now = new Date();
      const endDate = new Date(restaurant.subscription.endDate);
      const diffTime = endDate - now;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (daysRemaining <= warningDays) {
        showWarning = true;
      }
    }

    // Return history in reverse chronological order (latest first)
    const subscriptionHistory = (restaurant.subscriptionHistory || []).
    slice().
    reverse();

    return successResponse(res, 200, 'Subscription status retrieved', {
      subscription: restaurant.subscription,
      subscriptionHistory,
      isActive: restaurant.isActive,
      businessModel: restaurant.businessModel,
      daysRemaining,
      showWarning,
      warningDays
    });
  } catch (error) {
    console.error('Get status error:', error);
    return errorResponse(res, 500, 'Failed to get subscription status');
  }
};

// Admin: Get all restaurants with subscriptions
export const getAllSubscriptions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;
    const search = req.query.search?.toString().trim();

    const query = {
      $and: [
      {
        $or: [
        { businessModel: 'Subscription Base' },
        { 'subscription.status': 'pending_approval' }]

      },
      { 'subscription.planId': { $exists: true, $ne: null } },
      { 'subscription.status': { $ne: 'inactive' } }]

    };

    if (search) {
      query.$and.push({
        $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }]

      });
    }

    const total = await Restaurant.countDocuments(query);

    const restaurants = await Restaurant.find(query).
    select('name email phone subscription subscriptionHistory isActive createdAt businessModel').
    sort({ createdAt: -1 }).
    skip(skip).
    limit(limit).
    lean();

    // Get all unique plan IDs
    const planIds = [...new Set(restaurants.
    map((r) => r.subscription?.planId).
    filter((id) => id && id.match(/^[0-9a-fA-F]{24}$/)) // Only valid ObjectIds
    )];

    // Fetch plans
    const plans = await SubscriptionPlan.find({ _id: { $in: planIds } });
    const planMap = plans.reduce((acc, plan) => {
      acc[plan._id.toString()] = plan;
      return acc;
    }, {});

    // Attach plan details
    const restaurantsWithPlans = restaurants.map((restaurant) => {
      let planName = 'Basic Plan'; // Default fallback
      const planId = restaurant.subscription?.planId;

      if (planId) {
        const planIdStr = planId.toString();
        if (planMap[planIdStr]) {
          planName = planMap[planIdStr].name;
        } else if (restaurant.subscription?.planName) {
          // Use stored plan name if available
          planName = restaurant.subscription.planName;
        } else if (planIdStr.length < 20) {
          // Legacy or literal string plan IDs (like "premium", "starter")
          planName = planIdStr.charAt(0).toUpperCase() + planIdStr.slice(1).replace(/_/g, ' ') + ' Plan';
        }
      }

      return {
        ...restaurant,
        subscriptionPlanName: planName,
        subscription: {
          ...restaurant.subscription,
          planName: planName
        }
      };
    });

    return successResponse(res, 200, 'Subscriptions retrieved successfully', {
      restaurants: restaurantsWithPlans,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all subscriptions error:', error);
    return errorResponse(res, 500, 'Failed to get subscriptions');
  }
};

// Admin: Update subscription manually
export const updateSubscriptionStatus = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { status, planId, startDate, endDate } = req.body;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const updateFields = {};
    updateFields['subscription.status'] = status;

    let plan = null;
    if (planId) {
      plan = await SubscriptionPlan.findById(planId);
    }

    const effectivePlanId = plan ? planId : restaurant.subscription.planId;

    if (plan) {
      updateFields['subscription.planId'] = planId;
      updateFields['subscription.planName'] = plan.name;
    }

    if (status === 'active') {
      if (!effectivePlanId) {
        return errorResponse(res, 400, 'Cannot activate subscription without a valid plan');
      }

      // If we have a plan object (either fetched now or we should fetch it if it's existing planId)
      if (!plan && effectivePlanId) {
        plan = await SubscriptionPlan.findById(effectivePlanId);
      }

      const now = new Date();

      // Use provided dates if available, otherwise calculate
      if (startDate) {
        updateFields['subscription.startDate'] = new Date(startDate);
      } else if (!restaurant.subscription?.startDate) {
        updateFields['subscription.startDate'] = now;
      }

      if (endDate) {
        updateFields['subscription.endDate'] = new Date(endDate);
      } else {
        // Calculate based on plan — use setMonth() for correct month-length handling
        if (!plan) {
          if (['1_month', '6_months', '12_months'].includes(effectivePlanId)) {
            const durationMonths = effectivePlanId === '1_month' ? 1 : effectivePlanId === '6_months' ? 6 : 12;
            const calcEndDate = new Date(updateFields['subscription.startDate'] || now);
            calcEndDate.setMonth(calcEndDate.getMonth() + durationMonths);
            updateFields['subscription.endDate'] = calcEndDate;
          } else {
            return errorResponse(res, 404, 'Plan not found to calculate duration');
          }
        } else {
          // Use setMonth for accurate calendar months (not flat 30-day approximation)
          const calcStartDate = new Date(updateFields['subscription.startDate'] || now);
          const calcEndDate = new Date(calcStartDate);
          calcEndDate.setMonth(calcEndDate.getMonth() + plan.durationMonths);
          // Handle month-end overflow (e.g. Jan 31 + 1 month = Feb 28)
          if (calcEndDate.getDate() !== calcStartDate.getDate()) {
            calcEndDate.setDate(0);
          }
          updateFields['subscription.endDate'] = calcEndDate;
        }
      }

      updateFields['isActive'] = true;
      updateFields['businessModel'] = 'Subscription Base';

    } else if (status === 'inactive' || status === 'expired') {
      updateFields['businessModel'] = 'Commission Base';
      updateFields['isActive'] = true; // Keep restaurant active on commission mode
    }

    await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: updateFields },
      { new: true, runValidators: false }
    );

    // If activating, ensure commission is set to 0
    if (status === 'active') {
      await RestaurantCommission.findOneAndUpdate(
        { restaurant: restaurantId },
        {
          $setOnInsert: {
            restaurant: restaurant._id,
            restaurantName: restaurant.name,
            restaurantId: restaurant.restaurantId,
            createdBy: req.user?._id
          },
          $set: {
            "defaultCommission.value": 0,
            "defaultCommission.type": "percentage"
          }
        },
        { upsert: true }
      );
    } else if (status === 'inactive' || status === 'expired') {
      // Reset to default commission (e.g. 10%) if subscription is cancelled
      const commissionUpdateResult = await RestaurantCommission.updateOne(
        { restaurant: restaurantId },
        {
          $set: {
            "defaultCommission.value": 10,
            "defaultCommission.type": "percentage"
          }
        }
      );
      if (!commissionUpdateResult?.matchedCount) {
        console.warn(`No RestaurantCommission record found for restaurant ${restaurantId}; skipped fallback commission sync`);
      }
    }

    // Create audit log for admin update
    try {
      await AuditLog.createLog({
        entityType: 'restaurant',
        entityId: restaurantId,
        action: 'admin_update_subscription',
        actionType: 'update',
        performedBy: {
          type: 'admin',
          userId: req.user._id,
          name: req.user.name || 'Admin'
        },
        description: `Admin updated subscription status to ${status}${plan ? ` and plan to ${plan.name}` : ''}`,
        metadata: {
          status,
          planId: planId || 'unchanged',
          businessModel: updateFields['businessModel'] || 'unchanged'
        }
      });
    } catch (logError) {
      console.error('Error creating audit log for admin sub update:', logError);
    }

    const updatedRestaurant = await Restaurant.findById(restaurantId);

    return successResponse(res, 200, 'Subscription updated successfully', {
      subscription: updatedRestaurant.subscription
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    return errorResponse(res, 500, error.message || 'Failed to update subscription');
  }
};
