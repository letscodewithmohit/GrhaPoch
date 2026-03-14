import Razorpay from 'razorpay';
import axios from 'axios';
import crypto from 'crypto';
import winston from 'winston';
import { getRazorpayCredentials } from '../utils/envService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Razorpay instance
let razorpayInstance = null;
const isMockRazorpayEnabled = () =>
  String(process.env.ENABLE_MOCK_RAZORPAY || '').toLowerCase() === 'true';

const initializeRazorpay = async () => {
  try {
    const credentials = await getRazorpayCredentials();
    const keyId = credentials.keyId;
    const keySecret = credentials.keySecret;

    if (!keyId || !keySecret) {
      logger.warn('Razorpay credentials not found. Payment gateway will not work.', {
        keyId: keyId ? 'present' : 'missing',
        keySecret: keySecret ? 'present' : 'missing'
      });
      return null;
    }

    try {
      razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      return razorpayInstance;
    } catch (error) {
      logger.error(`Error initializing Razorpay: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  } catch (error) {
    logger.error(`Error fetching Razorpay credentials: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
};

// Get Razorpay instance
const getRazorpayInstance = async () => {
  if (!razorpayInstance) {
    return await initializeRazorpay();
  }
  return razorpayInstance;
};

/**
 * Create a Razorpay order
 * @param {Object} options - Order options
 * @param {Number} options.amount - Amount in paise (e.g., 10000 for ₹100)
 * @param {String} options.currency - Currency code (default: INR)
 * @param {String} options.receipt - Receipt ID
 * @param {Object} options.notes - Additional notes
 * @returns {Promise<Object>} Razorpay order object
 */
const createOrder = async (options) => {
  logger.info('Creating Razorpay order with options:', {
    amount: options.amount,
    currency: options.currency,
    receipt: options.receipt
  });

  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    logger.error('Razorpay instance is null - credentials may be missing or invalid');
    throw new Error('Razorpay is not initialized. Please check your credentials.');
  }

  try {
    const orderOptions = {
      amount: options.amount, // Amount in paise
      currency: options.currency || 'INR',
      receipt: options.receipt || `receipt_${Date.now()}`,
      customer_id: options.customer_id,
      notes: options.notes || {}
    };

    logger.info('Calling Razorpay API to create order...');

    // Optional mock mode for local development only
    if (isMockRazorpayEnabled()) {
      logger.warn('⚠️ ENABLE_MOCK_RAZORPAY=true detected. Returning mock order for development.');
      return {
        id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        amount: orderOptions.amount,
        currency: orderOptions.currency,
        receipt: orderOptions.receipt,
        status: 'created',
        notes: orderOptions.notes,
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    const order = await razorpay.orders.create(orderOptions);

    logger.info(`Razorpay order created successfully: ${order.id}`, {
      orderId: order.id,
      amount: order.amount,
      receipt: order.receipt,
      status: order.status
    });

    return order;
  } catch (error) {
    logger.error(`Error creating Razorpay order:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      options: {
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt
      },
      stack: error.stack
    });

    // Return more descriptive error message
    let errorMessage = 'Failed to create payment order';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Verify Razorpay payment signature
 * @param {String} razorpayOrderId - Razorpay order ID
 * @param {String} razorpayPaymentId - Razorpay payment ID
 * @param {String} razorpaySignature - Razorpay signature
 * @returns {Boolean} True if signature is valid
 */
const verifyPayment = async (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  const credentials = await getRazorpayCredentials();
  const keySecret = credentials.keySecret;

  if (!keySecret) {
    logger.error('Razorpay key secret not found');
    return false;
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const isValid = generatedSignature === razorpaySignature;

    // Allow mock payments only when explicit mock mode is enabled
    if (!isValid && isMockRazorpayEnabled()) {
      if (razorpayOrderId && razorpayOrderId.startsWith('order_mock_')) {
        logger.warn('⚠️ Verifying mock payment because ENABLE_MOCK_RAZORPAY=true.');
        return true;
      }
    }

    if (!isValid) {
      logger.warn('Invalid Razorpay signature', {
        razorpayOrderId,
        razorpayPaymentId,
        providedSignature: razorpaySignature,
        generatedSignature
      });
    }

    return isValid;
  } catch (error) {
    logger.error(`Error verifying Razorpay payment: ${error.message}`);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const fetchPayment = async (paymentId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error(`Error fetching Razorpay payment: ${error.message}`);
    throw error;
  }
};

/**
 * Create a Razorpay UPI QR code
 * @param {Object} options - QR options
 * @returns {Promise<Object>} Razorpay QR object
 */
const createQrCode = async (options) => {
  try {
    const qrOptions = {
      type: options.type || 'upi_qr',
      name: options.name || `Order QR ${Date.now()}`,
      usage: options.usage || 'single_use',
      fixed_amount: options.fixed_amount !== undefined ? options.fixed_amount : true,
      payment_amount: options.payment_amount,
      description: options.description,
      notes: options.notes || {}
    };

    if (typeof qrOptions.payment_amount !== 'number' || qrOptions.payment_amount <= 0) {
      throw new Error('QR payment_amount must be a positive number in paise');
    }

    if (isMockRazorpayEnabled()) {
      logger.warn('⚠️ ENABLE_MOCK_RAZORPAY=true detected. Returning mock QR for development.');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="200" height="200" fill="#111"/><text x="120" y="125" font-size="14" fill="#fff" text-anchor="middle">MOCK QR</text></svg>`;
      return {
        id: `qr_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        image_url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        payment_amount: qrOptions.payment_amount,
        notes: qrOptions.notes
      };
    }

    const credentials = await getRazorpayCredentials();
    const keyId = credentials.keyId;
    const keySecret = credentials.keySecret;

    if (!keyId || !keySecret) {
      logger.error('Razorpay credentials missing for QR creation');
      throw new Error('Razorpay credentials not found. Please check your keys.');
    }

    const qrResponse = await axios.post(
      'https://api.razorpay.com/v1/payments/qr_codes',
      qrOptions,
      {
        auth: {
          username: keyId,
          password: keySecret
        },
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const qr = qrResponse?.data;
    if (!qr?.id) {
      throw new Error('Invalid QR response from Razorpay');
    }

    const requestId = qrResponse?.headers?.['x-razorpay-request-id'];
    logger.info(`Razorpay QR created successfully: ${qr.id}`, {
      requestId
    });
    return qr;
  } catch (error) {
    const statusCode = error?.response?.status || error?.statusCode;
    const responseData = error?.response?.data;
    const requestId = error?.response?.headers?.['x-razorpay-request-id'];
    const requestUrl = error?.config?.url;
    const requestMethod = error?.config?.method;
    let requestPayload = null;
    try {
      requestPayload = error?.config?.data ? JSON.parse(error.config.data) : null;
    } catch {
      requestPayload = error?.config?.data || null;
    }
    logger.error(`Error creating Razorpay QR:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: statusCode,
      status: error.status,
      responseData,
      requestId,
      requestUrl,
      requestMethod,
      requestPayload
    });

    const razorpayMessage =
      responseData?.error?.description ||
      responseData?.error?.reason ||
      responseData?.error?.code ||
      error?.message ||
      'Failed to create Razorpay QR';
    throw new Error(razorpayMessage);
  }
};

/**
 * Verify Razorpay subscription payment signature
 * @param {String} razorpaySubscriptionId - Razorpay subscription ID
 * @param {String} razorpayPaymentId - Razorpay payment ID
 * @param {String} razorpaySignature - Razorpay signature
 * @returns {Boolean} True if signature is valid
 */
const verifySubscriptionPayment = async (razorpaySubscriptionId, razorpayPaymentId, razorpaySignature) => {
  const credentials = await getRazorpayCredentials();
  const keySecret = credentials.keySecret;

  if (!keySecret) {
    logger.error('Razorpay key secret not found');
    return false;
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
      .digest('hex');

    const isValid = generatedSignature === razorpaySignature;

    if (!isValid && isMockRazorpayEnabled()) {
      if (razorpaySubscriptionId && razorpaySubscriptionId.startsWith('sub_mock_')) {
        logger.warn('⚠️ Verifying mock subscription payment because ENABLE_MOCK_RAZORPAY=true.');
        return true;
      }
    }

    if (!isValid) {
      logger.warn('Invalid Razorpay subscription signature', {
        razorpaySubscriptionId,
        razorpayPaymentId,
        providedSignature: razorpaySignature,
        generatedSignature
      });
    }

    return isValid;
  } catch (error) {
    logger.error(`Error verifying Razorpay subscription payment: ${error.message}`);
    return false;
  }
};

/**
 * Fetch order details from Razorpay
 * @param {String} orderId - Razorpay order ID
 * @returns {Promise<Object>} Order details
 */
const fetchOrder = async (orderId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    return await razorpay.orders.fetch(orderId);
  } catch (error) {
    logger.error(`Error fetching Razorpay order: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch payments linked to a Razorpay order
 * @param {String} orderId - Razorpay order ID
 * @returns {Promise<Array>} Payments list
 */
const fetchOrderPayments = async (orderId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const result = await razorpay.orders.fetchPayments(orderId);
    return result?.items || [];
  } catch (error) {
    logger.error(`Error fetching Razorpay order payments: ${error.message}`);
    throw error;
  }
};

/**
 * Create a Razorpay plan
 * @param {Object} options - Plan options
 * @param {String} options.period - Billing period (e.g., monthly)
 * @param {Number} options.interval - Billing interval (e.g., 1, 3, 6)
 * @param {Object} options.item - Item details { name, amount, currency, description }
 * @param {Object} options.notes - Optional notes
 * @returns {Promise<Object>} Razorpay plan object
 */
const createPlan = async (options) => {
  logger.info('Creating Razorpay plan with options:', {
    period: options.period,
    interval: options.interval,
    itemName: options.item?.name,
    currency: options.item?.currency
  });

  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    logger.error('Razorpay instance is null - credentials may be missing or invalid');
    throw new Error('Razorpay is not initialized. Please check your credentials.');
  }

  try {
    const planOptions = {
      period: options.period || 'monthly',
      interval: options.interval || 1,
      item: {
        name: options.item?.name || `Plan ${Date.now()}`,
        amount: options.item?.amount,
        currency: options.item?.currency || 'INR',
        description: options.item?.description || ''
      },
      notes: options.notes || {}
    };

    if (typeof planOptions.item.amount !== 'number' || planOptions.item.amount < 0) {
      throw new Error('Plan item amount must be a non-negative number');
    }

    // Optional mock mode for local development only
    if (isMockRazorpayEnabled()) {
      logger.warn('⚠️ ENABLE_MOCK_RAZORPAY=true detected. Returning mock plan for development.');
      return {
        id: `plan_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        period: planOptions.period,
        interval: planOptions.interval,
        item: {
          id: `item_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          ...planOptions.item
        },
        notes: planOptions.notes,
        created_at: Math.floor(Date.now() / 1000)
      };
    }

    const plan = await razorpay.plans.create(planOptions);

    logger.info(`Razorpay plan created successfully: ${plan.id}`, {
      planId: plan.id,
      period: plan.period,
      interval: plan.interval
    });

    return plan;
  } catch (error) {
    logger.error(`Error creating Razorpay plan:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      stack: error.stack
    });

    let errorMessage = 'Failed to create Razorpay plan';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Create a Razorpay subscription
 * @param {Object} options - Subscription options
 * @param {String} options.plan_id - Razorpay plan ID
 * @param {Number} options.total_count - Total billing cycles
 * @param {Number} options.customer_notify - Notify customer (0/1)
 * @param {Object} options.notes - Optional notes
 * @param {Number} options.quantity - Quantity (optional)
 * @param {Number} options.start_at - Unix timestamp for start (optional)
 * @returns {Promise<Object>} Razorpay subscription object
 */
const createSubscription = async (options) => {
  logger.info('Creating Razorpay subscription with options:', {
    plan_id: options.plan_id,
    total_count: options.total_count,
    customer_notify: options.customer_notify
  });

  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    logger.error('Razorpay instance is null - credentials may be missing or invalid');
    throw new Error('Razorpay is not initialized. Please check your credentials.');
  }

  try {
    const subscriptionOptions = {
      plan_id: options.plan_id,
      total_count: options.total_count,
      customer_notify: options.customer_notify ?? 1,
      quantity: options.quantity,
      start_at: options.start_at,
      customer_id: options.customer_id,
      notes: options.notes || {}
    };

    if (!subscriptionOptions.plan_id) {
      throw new Error('Subscription plan_id is required');
    }
    if (!Number.isFinite(subscriptionOptions.total_count) || subscriptionOptions.total_count < 1) {
      throw new Error('Subscription total_count must be a positive number');
    }

    // Optional mock mode for local development only
    if (isMockRazorpayEnabled()) {
      logger.warn('⚠️ ENABLE_MOCK_RAZORPAY=true detected. Returning mock subscription for development.');
      return {
        id: `sub_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        plan_id: subscriptionOptions.plan_id,
        status: 'created',
        total_count: subscriptionOptions.total_count,
        quantity: subscriptionOptions.quantity || 1,
        notes: subscriptionOptions.notes,
        created_at: Math.floor(Date.now() / 1000),
        short_url: `https://checkout.razorpay.com/v1/sub_mock_${Date.now()}`
      };
    }

    const subscription = await razorpay.subscriptions.create(subscriptionOptions);

    logger.info(`Razorpay subscription created successfully: ${subscription.id}`, {
      subscriptionId: subscription.id,
      status: subscription.status
    });

    return subscription;
  } catch (error) {
    logger.error(`Error creating Razorpay subscription:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      stack: error.stack
    });

    let errorMessage = 'Failed to create Razorpay subscription';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Fetch subscription details from Razorpay
 * @param {String} subscriptionId - Razorpay subscription ID
 * @returns {Promise<Object>} Subscription details
 */
const fetchSubscription = async (subscriptionId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    return await razorpay.subscriptions.fetch(subscriptionId);
  } catch (error) {
    logger.error(`Error fetching Razorpay subscription: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch payments linked to a Razorpay subscription
 * @param {String} subscriptionId - Razorpay subscription ID
 * @returns {Promise<Array>} Payments list
 */
const fetchSubscriptionPayments = async (subscriptionId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const result = await razorpay.subscriptions.fetchPayments(subscriptionId);
    return result?.items || [];
  } catch (error) {
    logger.error(`Error fetching Razorpay subscription payments: ${error.message}`);
    throw error;
  }
};

/**
 * Cancel a Razorpay subscription (stops future auto-payments)
 * @param {String} subscriptionId - Razorpay subscription ID
 * @returns {Promise<Object>} Updated subscription object from Razorpay
 */
const cancelSubscription = async (subscriptionId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  if (!subscriptionId) {
    throw new Error('Subscription ID is required to cancel subscription');
  }

  try {
    logger.info('Cancelling Razorpay subscription:', {
      subscriptionId
    });

    // Optional mock mode for local development only
    if (isMockRazorpayEnabled()) {
      logger.warn('⚠️ ENABLE_MOCK_RAZORPAY=true detected. Returning mock cancelled subscription for development.');
      return {
        id: subscriptionId.startsWith('sub_mock_') ? subscriptionId : `sub_mock_${subscriptionId}`,
        status: 'cancelled',
        ended_at: Math.floor(Date.now() / 1000)
      };
    }

    const cancelled = await razorpay.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 });

    logger.info(`Razorpay subscription cancelled (auto-renew stopped): ${cancelled.id}`, {
      subscriptionId: cancelled.id,
      status: cancelled.status,
      cancelAtPeriodEnd: !!cancelled.cancel_at_cycle_end
    });

    return cancelled;
  } catch (error) {
    logger.error('Error cancelling Razorpay subscription:', {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      stack: error.stack
    });

    let errorMessage = 'Failed to cancel Razorpay subscription';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.message) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
};

/**
 * Create a refund
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number} amount - Refund amount in paise (optional, full refund if not provided)
 * @param {String} notes - Refund notes
 * @returns {Promise<Object>} Refund details
 */
const createRefund = async (paymentId, amount = null, notes = {}) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const refundOptions = {
      notes: notes
    };

    if (amount) {
      refundOptions.amount = amount;
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    logger.info(`Refund created: ${refund.id}`, {
      refundId: refund.id,
      paymentId,
      amount: refund.amount
    });

    return refund;
  } catch (error) {
    logger.error(`Error creating refund: ${error.message}`);
    throw error;
  }
};

/**
 * Create a Razorpay customer
 * @param {Object} options - Customer options
 * @param {String} options.name - Customer name
 * @param {String} options.email - Customer email
 * @param {String} options.contact - Customer contact number
 * @param {Object} options.notes - Optional notes
 * @returns {Promise<Object>} Razorpay customer object
 */
const createCustomer = async (options) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const customer = await razorpay.customers.create({
      name: options.name,
      email: options.email,
      contact: options.contact,
      notes: options.notes || {}
    });
    return customer;
  } catch (error) {
    logger.error(`Error creating Razorpay customer: ${error.message}`);
    throw error;
  }
};

export {
  initializeRazorpay,
  getRazorpayInstance,
  createOrder,
  verifyPayment,
  verifySubscriptionPayment,
  fetchPayment,
  createQrCode,
  fetchOrder,
  fetchOrderPayments,
  createPlan,
  createSubscription,
  fetchSubscription,
  fetchSubscriptionPayments,
  cancelSubscription,
  createRefund,
  createCustomer
};

