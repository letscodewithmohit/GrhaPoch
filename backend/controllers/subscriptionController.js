import Restaurant from '../models/Restaurant.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { successResponse, errorResponse } from '../utils/response.js';
import {
  createSubscription,
  verifySubscriptionPayment,
  cancelSubscription as cancelRazorpaySubscription,
  createCustomer,
  createOrder,
  verifyPayment
} from '../services/razorpayService.js';
import crypto from 'crypto';
import AuditLog from '../models/AuditLog.js';
import RestaurantCommission from '../models/RestaurantCommission.js';
import BusinessSettings from '../models/BusinessSettings.js';
import RestaurantNotification from '../models/RestaurantNotification.js';
import mongoose from 'mongoose';
import SubscriptionPayment from '../models/SubscriptionPayment.js';
import RazorpayWebhookEvent from '../models/RazorpayWebhookEvent.js';
import { getEnvVar, getRazorpayCredentials } from '../utils/envService.js';

const SUBSCRIPTION_WEBHOOK_EVENTS = new Set([
  'subscription.activated',
  'subscription.charged',
  'subscription.completed',
  'subscription.cancelled',
  'payment.failed'
]);

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  const stringValue = String(value);
  if (!mongoose.Types.ObjectId.isValid(stringValue)) return null;
  return new mongoose.Types.ObjectId(stringValue);
};

const buildSubscriptionPaymentFilter = ({ razorpaySubscriptionId, razorpayOrderId, razorpayPaymentId }) => {
  const filters = [];
  const subscriptionId = String(razorpaySubscriptionId || '').trim();
  const orderId = String(razorpayOrderId || '').trim();
  const paymentId = String(razorpayPaymentId || '').trim();

  if (subscriptionId) filters.push({ razorpaySubscriptionId: subscriptionId });
  if (orderId) filters.push({ razorpayOrderId: orderId });
  if (paymentId) filters.push({ razorpayPaymentId: paymentId });

  return filters.length ? { $or: filters } : null;
};

const getWebhookSecret = async () => {
  const secretFromEnvStore = await getEnvVar('RAZORPAY_WEBHOOK_SECRET', '');
  return String(secretFromEnvStore || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
};

const buildSubscriptionDates = ({ restaurant, plan, now = new Date() }) => {
  let startDate = new Date(now);
  let endDate = new Date(now);

  const isRenewing = restaurant.businessModel === 'Subscription Base' &&
    ['active', 'cancelled'].includes(restaurant.subscription?.status) &&
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
    subscriptionId: restaurant.subscription.subscriptionId || '',
    invoiceId: restaurant.subscription.invoiceId || '',
    status: 'renewed',
    startDate: restaurant.subscription.startDate,
    endDate: restaurant.subscription.endDate,
    paymentId: restaurant.subscription.paymentId,
    orderId: restaurant.subscription.orderId,
    activatedAt: restaurant.subscription.startDate || now
  });
};

const cancelSubscriptionCore = async ({
  restaurant,
  source = 'restaurant',
  session
}) => {
  if (!restaurant.subscription || !restaurant.subscription.subscriptionId) {
    throw new Error('No active subscription found to cancel');
  }

  const currentStatus = restaurant.subscription.status;
  if (
    currentStatus === 'expired' ||
    currentStatus === 'inactive' ||
    currentStatus === 'rejected' ||
    currentStatus === 'cancelled' ||
    restaurant.subscription.cancelAtPeriodEnd === true
  ) {
    return { restaurant, wasAlreadyCancelled: true };
  }

  const subscriptionId = String(restaurant.subscription.subscriptionId || '').trim();
  if (!subscriptionId) {
    throw new Error('Razorpay subscription ID missing for cancellation');
  }

  // Step 1: Cancel on Razorpay (stops future billing)
  try {
    console.log(`[SubscriptionCancel] Initiating Razorpay cancel for ${subscriptionId} (Source: ${source})`);
    await cancelRazorpaySubscription(subscriptionId);
    console.log(`[SubscriptionCancel] Razorpay cancel successful for ${subscriptionId}`);
  } catch (razorpayError) {
    const msg = String(razorpayError?.message || '');
    const isCompletedNotCancellable =
      msg.toLowerCase().includes('not cancellable') &&
      msg.toLowerCase().includes('completed');

    if (isCompletedNotCancellable) {
      console.log(`[SubscriptionCancel] Subscription ${subscriptionId} already completed or not cancellable in Razorpay. Updating local DB only.`);
    } else {
      console.error(`[SubscriptionCancel] Razorpay API error for ${subscriptionId}:`, razorpayError);
      throw razorpayError;
    }
  }

  // Step 2: Update Restaurant Document
  // We mark it as 'cancelled' immediately so the UI shows it's cancelled,
  // but RestaurantCommission logic now allows 'cancelled' status to keep 0% commission
  // until the endDate is actually reached.
  restaurant.subscription.status = 'cancelled';
  restaurant.subscription.cancelAtPeriodEnd = true;
  restaurant.subscription.autoRenew = false;
  restaurant.subscription.cancelledAt = new Date();

  await restaurant.save({ session });
  console.log(`[SubscriptionCancel] MongoDB updated for restaurant ${restaurant._id}. Status set to cancelled.`);

  const paymentFilter = buildSubscriptionPaymentFilter({
    razorpaySubscriptionId: subscriptionId
  });
  if (paymentFilter) {
    const paymentRecord = await SubscriptionPayment.findOne(paymentFilter).session(session);
    if (paymentRecord && paymentRecord.status === 'pending') {
      paymentRecord.status = 'failed';
      paymentRecord.source = source === 'webhook' ? 'webhook' : 'verify_api';
      paymentRecord.lastError = 'Subscription cancelled before activation';
      await paymentRecord.save({ session });
    }
  }

  try {
    await AuditLog.createLog(
      {
        entityType: 'restaurant',
        entityId: restaurant._id,
        action: 'subscription_cancelled',
        actionType: 'update',
        performedBy: {
          type: source === 'admin' ? 'admin' : source === 'webhook' ? 'system' : 'restaurant',
          userId:
            source === 'admin'
              ? 'admin'
              : source === 'webhook'
                ? 'system'
                : restaurant._id,
          name:
            source === 'admin'
              ? 'Admin'
              : source === 'webhook'
                ? 'Razorpay Webhook'
                : restaurant.name
        },
        description: 'Subscription auto-renew disabled; subscription will remain active until end of period',
        metadata: {
          subscriptionId,
          previousModel: 'Subscription Base',
          newModel: 'Subscription Base',
          source
        }
      },
      { session }
    );
  } catch (logError) {
    console.error('Error logging subscription cancellation:', logError);
  }

  return { restaurant, wasAlreadyCancelled: false };
};

export const activateSubscriptionTx = async ({
  restaurantId,
  planId,
  razorpaySubscriptionId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpayInvoiceId,
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

  const normalizedSubscriptionId = String(razorpaySubscriptionId || '').trim();
  const normalizedOrderId = String(razorpayOrderId || '').trim();
  const normalizedPaymentId = String(razorpayPaymentId || '').trim();
  const normalizedInvoiceId = String(razorpayInvoiceId || '').trim();

  if (!normalizedSubscriptionId && !normalizedOrderId) {
    throw new Error('Razorpay subscription or order ID is required');
  }

  // Idempotency: If we have a payment ID, only block if THIS payment was already processed.
  // This allows multiple payments (renewals) under the same subscription ID.
  if (normalizedPaymentId) {
    const existingPayment = await SubscriptionPayment.findOne({
      razorpayPaymentId: normalizedPaymentId,
      status: 'success'
    }).session(session);

    if (existingPayment) {
      return {
        subscription: restaurant.subscription,
        plan,
        isAlreadyActive: true,
        paymentStatus: 'success'
      };
    }
  } else {
    // If no payment ID yet, check if the subscription/order already has any success
    // This handles the 'first activation' stage before a payment ID is assigned.
    const idempotencyFilter = buildSubscriptionPaymentFilter({
      razorpaySubscriptionId: normalizedSubscriptionId,
      razorpayOrderId: normalizedOrderId
    });

    const existingSuccessfulOrder = idempotencyFilter ? await SubscriptionPayment.findOne({
      ...idempotencyFilter,
      status: 'success'
    }).session(session) : null;

    if (existingSuccessfulOrder) {
      return { subscription: restaurant.subscription, plan, isAlreadyActive: true };
    }
  }

  // Check if this EXACT payment is already active on the restaurant
  const isThisPaymentReflected =
    normalizedPaymentId &&
    String(restaurant.subscription?.paymentId || '').trim() === normalizedPaymentId;

  if (restaurant.subscription?.status === 'active' && isThisPaymentReflected) {
    return { subscription: restaurant.subscription, plan, isAlreadyActive: true };
  }

  // If we have an active subscription with the SAME subscriptionId/orderId but a NEW paymentId,
  // it means this is a renewal. We proceed to update the dates.
  // We ONLY block if both ID matches AND we don't have a new payment to process.
  if (
    restaurant.subscription?.status === 'active' &&
    !normalizedPaymentId &&
    ((normalizedOrderId && String(restaurant.subscription.orderId || '').trim() === normalizedOrderId) ||
      (normalizedSubscriptionId && String(restaurant.subscription.subscriptionId || '').trim() === normalizedSubscriptionId))
  ) {
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
    orderId: razorpayOrderId || '',
    subscriptionId: razorpaySubscriptionId || '',
    invoiceId: razorpayInvoiceId || '',
    // New subscriptions always start with auto-renew enabled and no pending cancellation
    cancelAtPeriodEnd: false,
    autoRenew: true
  };
  restaurant.businessModel = 'Subscription Base';
  // Keep newly registered restaurants inactive until admin approval.
  restaurant.isActive = requiresAdminApproval ? false : true;

  // CRITICAL FIX: Normalize invalid accountType enum values that might prevent saving
  if (restaurant.onboarding?.step3?.bank?.accountType) {
    const at = String(restaurant.onboarding.step3.bank.accountType).toLowerCase();
    if (at === 'saving' || at === 'savings') {
      restaurant.onboarding.step3.bank.accountType = 'Saving';
    } else if (at === 'current') {
      restaurant.onboarding.step3.bank.accountType = 'Current';
    }
  }

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
    buildSubscriptionPaymentFilter({ razorpayPaymentId, razorpayOrderId, razorpaySubscriptionId }) :
    buildSubscriptionPaymentFilter({ razorpayOrderId, razorpaySubscriptionId });

  if (!paymentFilter) {
    throw new Error('Unable to build payment filter for activation');
  }

  // Find existing payment record to update, or create a new one
  // Note: MongoDB doesn't allow upsert with $or filters. We'll handle this manually.
  let paymentRecord = await SubscriptionPayment.findOne(paymentFilter).session(session);

  const updateData = {
    restaurantId: restaurant._id,
    planId: plan._id,
    planName: plan.name,
    razorpayPlanId: plan.razorpayPlanId || '',
    amount: plan.price,
    currency: plan.currency || 'INR',
    razorpayPaymentId: razorpayPaymentId || null,
    razorpayOrderId: razorpayOrderId || null,
    razorpaySubscriptionId: razorpaySubscriptionId || null,
    razorpayInvoiceId: razorpayInvoiceId || null,
    status: 'success',
    paymentDate: now,
    startDate,
    endDate,
    renewalType: isRenewing ? 'renewal' : 'new',
    source,
    lastError: ''
  };

  if (paymentRecord) {
    // Update existing
    Object.assign(paymentRecord, updateData);
    await paymentRecord.save({ session });
  } else {
    // Create new
    await SubscriptionPayment.create([updateData], { session });
  }

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
  razorpaySubscriptionId,
  razorpayInvoiceId,
  message = 'Payment failed',
  source = 'webhook'
}) => {
  const filter = buildSubscriptionPaymentFilter({
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySubscriptionId
  });

  if (!filter) {
    return;
  }

  await SubscriptionPayment.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'failed',
        source,
        lastError: message,
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        ...(razorpaySubscriptionId ? { razorpaySubscriptionId } : {}),
        ...(razorpayInvoiceId ? { razorpayInvoiceId } : {})
      }
    },
    { new: true }
  );
};

const extractWebhookPaymentContext = (payload) => {
  const subscriptionEntity = payload?.payload?.subscription?.entity || null;
  const paymentEntity = payload?.payload?.payment?.entity || null;
  const invoiceEntity = payload?.payload?.invoice?.entity || null;

  const subscriptionId =
    subscriptionEntity?.id ||
    paymentEntity?.subscription_id ||
    invoiceEntity?.subscription_id ||
    '';
  const paymentId = paymentEntity?.id || '';
  const orderId = paymentEntity?.order_id || '';
  const invoiceId = invoiceEntity?.id || paymentEntity?.invoice_id || '';
  const notes = subscriptionEntity?.notes || paymentEntity?.notes || invoiceEntity?.notes || {};
  const restaurantId = notes?.restaurantId || '';
  const planId = notes?.planId || '';
  const paymentDate = paymentEntity?.created_at ?
    new Date(Number(paymentEntity.created_at) * 1000) :
    new Date();
  const failureMessage = paymentEntity?.error_description || paymentEntity?.description || 'Payment failed';

  return {
    subscriptionId,
    paymentId,
    orderId,
    invoiceId,
    notes,
    restaurantId,
    planId,
    paymentDate,
    failureMessage
  };
};

// Create Razorpay subscription for plan
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
    const planRazorpayId = String(plan.razorpayPlanId || '').trim();
    if (!planRazorpayId) {
      return errorResponse(res, 400, `Razorpay plan ID is missing for ${plan.name}`);
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Guard: block payment if subscription is still active and not in warning window
    if (
      restaurant.businessModel === 'Subscription Base' &&
      restaurant.subscription?.status === 'active' &&
      restaurant.subscription?.endDate
    ) {
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

    const { keyId } = await getRazorpayCredentials();
    if (!keyId) {
      return errorResponse(res, 500, 'Payment gateway key is not configured');
    }

    // 1. Ensure restaurant has a Razorpay Customer ID
    let razorpayCustomerId = restaurant.razorpayCustomerId;
    if (!razorpayCustomerId) {
      try {
        const customer = await createCustomer({
          name: restaurant.name || restaurant.ownerName,
          email: restaurant.email || restaurant.ownerEmail,
          contact: restaurant.phone || restaurant.ownerPhone,
          notes: {
            restaurantId: restaurantId.toString(),
            internalId: restaurant.restaurantId
          }
        });
        razorpayCustomerId = customer.id;
        restaurant.razorpayCustomerId = razorpayCustomerId;
        await restaurant.save();
      } catch (custError) {
        console.error('Failed to create Razorpay customer:', custError);
        // Continue without customer_id if failed (optional, or throw error)
      }
    }

    // 2. Create Razorpay subscription using centralized service
    // Using Subscriptions API ensures status becomes 'Active' in Razorpay dashboard
    const subscription = await createSubscription({
      plan_id: planRazorpayId,
      total_count: 12, // For 1 month access with monthly billing, or adjust based on plan duration
      customer_notify: 1,
      customer_id: razorpayCustomerId || undefined,
      notes: {
        restaurantId: restaurantId.toString(),
        planId: planId.toString(),
        planKey: plan.planKey || '',
        razorpayPlanId: planRazorpayId,
        restaurantName: restaurant.name,
        type: 'subscription'
      }
    });

    return successResponse(res, 200, 'Subscription created successfully', {
      subscriptionId: subscription.id,
      status: subscription.status,
      amount: Math.round(plan.price * 100),
      currency: plan.currency || 'INR',
      razorpayPlanId: planRazorpayId,
      keyId
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return errorResponse(res, 500, error.message || 'Failed to create subscription');
  }
};


// Verify payment and activate subscription (optional fallback to webhooks)
export const verifyPaymentAndActivate = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    // Extracting to local variables to ensure they are available in closure scope
    const {
      razorpay_subscription_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      razorpay_order_id // Optional for subscriptions, but might be sent
    } = req.body;

    if (!razorpay_payment_id || !razorpay_signature || !planId || !razorpay_subscription_id) {
      return errorResponse(
        res,
        400,
        'razorpay_subscription_id, razorpay_payment_id, razorpay_signature and planId are required'
      );
    }

    const orderIdForFilter = razorpay_order_id || '__none__';

    const existingSuccess = await SubscriptionPayment.findOne({
      $or: [
        { razorpaySubscriptionId: razorpay_subscription_id },
        { razorpayOrderId: orderIdForFilter },
        { razorpayPaymentId: razorpay_payment_id }
      ],
      status: 'success'
    });

    if (existingSuccess) {
      const sameRestaurant = String(existingSuccess.restaurantId) === String(restaurantId);
      const samePlan = String(existingSuccess.planId) === String(planId);
      if (!sameRestaurant || !samePlan) {
        return errorResponse(res, 409, 'This payment is already mapped to a different subscription transaction');
      }

      const alreadyActivatedRestaurant = await Restaurant.findById(restaurantId).select('subscription');
      return successResponse(res, 200, 'Subscription already activated for this payment', {
        subscription: alreadyActivatedRestaurant?.subscription || null
      });
    }

    // Verify Subscription Payment Signature (payment_id | subscription_id)
    const isValid = await verifySubscriptionPayment(
      razorpay_subscription_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      await markSubscriptionPaymentFailed({
        razorpaySubscriptionId: razorpay_subscription_id,
        razorpayOrderId: razorpay_order_id || null,
        razorpayPaymentId: razorpay_payment_id,
        message: 'Invalid payment signature',
        source: 'verify_api'
      });
      return errorResponse(res, 400, 'Invalid payment signature');
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return errorResponse(res, 404, 'Subscription plan not found');

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

    const activationDate = new Date();
    const session = await mongoose.startSession();
    let activationResult = null;

    try {
      await session.withTransaction(async () => {
        activationResult = await activateSubscriptionTx({
          restaurantId: restaurant._id,
          planId: plan._id,
          razorpaySubscriptionId: razorpay_subscription_id,
          razorpayOrderId: razorpay_order_id || null,
          razorpayPaymentId: razorpay_payment_id,
          paymentDate: activationDate,
          source: 'verify_api',
          session
        });
      });
    } finally {
      await session.endSession();
    }

    return successResponse(res, 200, 'Subscription activated successfully', {
      subscription: activationResult?.subscription || restaurant.subscription
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return errorResponse(res, 500, 'Failed to verify payment: ' + (error.message || 'Unknown error'));
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
    if (!context.subscriptionId && !context.orderId) {
      webhookEvent.status = 'ignored';
      webhookEvent.errorMessage = 'Missing subscription reference in webhook payload';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook ignored (missing subscription reference)');
    }

    let restaurantId = context.restaurantId;
    let planId = context.planId;

    const pendingRecord = await SubscriptionPayment.findOne(
      buildSubscriptionPaymentFilter({
        razorpaySubscriptionId: context.subscriptionId,
        razorpayOrderId: context.orderId,
        razorpayPaymentId: context.paymentId
      }) || {}
    );
    if (!restaurantId && pendingRecord?.restaurantId) {
      restaurantId = String(pendingRecord.restaurantId);
    }
    if (!planId && pendingRecord?.planId) {
      planId = String(pendingRecord.planId);
    }

    if (eventType === 'payment.failed') {
      await markSubscriptionPaymentFailed({
        razorpayOrderId: context.orderId || null,
        razorpayPaymentId: context.paymentId || pendingRecord?.razorpayPaymentId || null,
        razorpaySubscriptionId: context.subscriptionId || pendingRecord?.razorpaySubscriptionId || null,
        razorpayInvoiceId: context.invoiceId || pendingRecord?.razorpayInvoiceId || null,
        message: context.failureMessage || 'Payment failed',
        source: 'webhook'
      });

      webhookEvent.status = 'processed';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook processed (payment failed)');
    }

    if (eventType === 'subscription.cancelled') {
      if (context.subscriptionId) {
        const restaurantWithSub = await Restaurant.findOne({
          'subscription.subscriptionId': context.subscriptionId
        });
        if (restaurantWithSub) {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await cancelSubscriptionCore({
                restaurant: restaurantWithSub,
                source: 'webhook',
                session
              });
            });
          } finally {
            await session.endSession();
          }
        }

        await SubscriptionPayment.updateMany(
          { razorpaySubscriptionId: context.subscriptionId },
          {
            $set: {
              source: 'webhook',
              lastError: 'Subscription cancelled via Razorpay webhook'
            }
          }
        );
      }

      webhookEvent.status = 'processed';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook processed (subscription cancelled)');
    }

    if (eventType === 'subscription.completed') {
      if (context.subscriptionId) {
        await SubscriptionPayment.findOneAndUpdate(
          { razorpaySubscriptionId: context.subscriptionId },
          {
            $set: {
              status: 'success',
              source: 'webhook'
            }
          },
          { new: true }
        );

        const restaurant = await Restaurant.findOne({ 'subscription.subscriptionId': context.subscriptionId });
        if (restaurant) {
          await checkSubscriptionExpiry(restaurant);
        }
      }

      webhookEvent.status = 'processed';
      webhookEvent.processedAt = new Date();
      await webhookEvent.save();
      return successResponse(res, 200, 'Webhook processed (subscription completed)');
    }

    if (eventType === 'subscription.charged' || eventType === 'subscription.activated') {
      console.log(`[SubscriptionWebhook] Handling ${eventType} for ${context.subscriptionId || context.orderId}. Payment: ${context.paymentId}`);

      // If notes are missing in payload, try to find them from existing records
      if (!restaurantId || !planId) {
        const lookupFilter = context.subscriptionId ?
          { 'subscription.subscriptionId': context.subscriptionId } :
          { 'subscription.orderId': context.orderId };

        const existingRest = await Restaurant.findOne(lookupFilter).select('_id subscription');
        if (existingRest) {
          restaurantId = existingRest._id.toString();
          planId = existingRest.subscription?.planId;
          console.log(`[SubscriptionWebhook] Resolved missing context from existing restaurant: ${restaurantId}`);
        }
      }
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
          razorpaySubscriptionId: context.subscriptionId || pendingRecord?.razorpaySubscriptionId || null,
          razorpayOrderId: context.orderId || pendingRecord?.razorpayOrderId || null,
          razorpayPaymentId: context.paymentId || pendingRecord?.razorpayPaymentId || null,
          razorpayInvoiceId: context.invoiceId || pendingRecord?.razorpayInvoiceId || null,
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

export const cancelSubscription = async (req, res) => {
  const restaurantId = req.restaurant?._id;

  if (!restaurantId) {
    return errorResponse(res, 401, 'Unauthorized');
  }

  const session = await mongoose.startSession();
  try {
    let restaurant = await Restaurant.findById(restaurantId).session(session);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    if (!restaurant.subscription || !restaurant.subscription.subscriptionId) {
      return errorResponse(res, 400, 'No active subscription to cancel');
    }

    let result;
    await session.withTransaction(async () => {
      restaurant = await Restaurant.findById(restaurantId).session(session);
      result = await cancelSubscriptionCore({
        restaurant,
        source: 'restaurant',
        session
      });
    });

    const message = result?.wasAlreadyCancelled
      ? 'Subscription already cancelled'
      : 'Subscription cancelled successfully';

    return successResponse(res, 200, message, {
      subscription: result?.restaurant?.subscription
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return errorResponse(res, 500, error.message || 'Failed to cancel subscription');
  } finally {
    await session.endSession();
  }
};

export const adminCancelSubscription = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!restaurantId) {
      return errorResponse(res, 400, 'Restaurant ID is required');
    }

    const session = await mongoose.startSession();
    let restaurant = await Restaurant.findById(restaurantId).session(session);
    if (!restaurant) {
      await session.endSession();
      return errorResponse(res, 404, 'Restaurant not found');
    }

    if (!restaurant.subscription || !restaurant.subscription.subscriptionId) {
      await session.endSession();
      return errorResponse(res, 400, 'Restaurant does not have an active subscription to cancel');
    }

    let result;
    try {
      await session.withTransaction(async () => {
        restaurant = await Restaurant.findById(restaurantId).session(session);
        result = await cancelSubscriptionCore({
          restaurant,
          source: 'admin',
          session
        });
      });
    } finally {
      await session.endSession();
    }

    const message = result?.wasAlreadyCancelled
      ? 'Subscription already cancelled'
      : 'Subscription cancelled successfully';

    return successResponse(res, 200, message, {
      subscription: result?.restaurant?.subscription
    });
  } catch (error) {
    console.error('Admin cancel subscription error:', error);
    return errorResponse(res, 500, error.message || 'Failed to cancel subscription');
  }
};

/**
 * Helper to check and expire subscription if end date passed
 * @param {Object} restaurant - Restaurant document (mongoose document)
 * @returns {Promise<Object>} - Updated restaurant document
 */
export const checkSubscriptionExpiry = async (restaurant) => {
  if (restaurant.businessModel === 'Subscription Base' && ['active', 'cancelled'].includes(restaurant.subscription?.status)) {
    const now = new Date();
    const endDate = new Date(restaurant.subscription.endDate);

    if (endDate < now) {


      if (!restaurant.subscriptionHistory) {
        restaurant.subscriptionHistory = [];
      }
      restaurant.subscriptionHistory.push({
        planId: restaurant.subscription.planId,
        planName: restaurant.subscription.planName,
        subscriptionId: restaurant.subscription.subscriptionId || '',
        invoiceId: restaurant.subscription.invoiceId || '',
        // If the user/admin cancelled auto-renew earlier, treat this as a
        // "cancelled at period end" in history; otherwise mark as expired.
        status: restaurant.subscription.cancelAtPeriodEnd ? 'cancelled' : 'expired',
        startDate: restaurant.subscription.startDate,
        endDate: restaurant.subscription.endDate,
        paymentId: restaurant.subscription.paymentId,
        orderId: restaurant.subscription.orderId,
        activatedAt: restaurant.subscription.startDate || now
      });

      restaurant.businessModel = 'Commission Base';
      restaurant.subscription.status = 'expired';
      // Once the period is over, clear cancellation/auto-renew flags so that
      // any future subscription starts from a clean state.
      restaurant.subscription.cancelAtPeriodEnd = false;
      restaurant.subscription.autoRenew = false;

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

    if (restaurant.businessModel === 'Subscription Base' && ['active', 'cancelled'].includes(restaurant.subscription?.status)) {
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

    // Prevent browser/proxy caching so UI always reflects current DB state
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    // Only return subscription when it is a real active/pending plan; otherwise null so UI does not show "Active"
    const sub = restaurant.subscription;
    const effectiveSubscription =
      sub && (['active', 'pending_approval', 'cancelled'].includes(sub.status)) && sub.planId
        ? sub
        : null;

    return successResponse(res, 200, 'Subscription status retrieved', {
      subscription: effectiveSubscription,
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
