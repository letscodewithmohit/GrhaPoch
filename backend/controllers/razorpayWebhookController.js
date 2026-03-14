import crypto from 'crypto';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { getEnvVar } from '../utils/envService.js';
import Order from '../models/Order.js';

const getRazorpayWebhookSecret = async () => {
  const secretFromEnvStore = await getEnvVar('RAZORPAY_WEBHOOK_SECRET', '');
  return String(secretFromEnvStore || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
};

const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
};

/**
 * Handle Razorpay webhook for QR-based COD payments
 * POST /api/razorpay/webhook
 */
export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = String(req.headers['x-razorpay-signature'] || '');
  const rawBody = req.rawBody || JSON.stringify(req.body || {});

  const webhookSecret = await getRazorpayWebhookSecret();
  if (!webhookSecret) {
    return errorResponse(res, 500, 'Webhook secret not configured');
  }

  const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return errorResponse(res, 400, 'Invalid webhook signature');
  }

  const eventType = String(req.body?.event || '').trim();
  if (eventType !== 'payment.captured') {
    return successResponse(res, 200, 'Webhook ignored', { event: eventType });
  }

  const paymentEntity = req.body?.payload?.payment?.entity;
  const notes = paymentEntity?.notes || {};
  const noteOrderId = notes.orderId || notes.order_id || notes.orderID || notes.order;
  const noteOrderMongoId = notes.orderMongoId || notes.order_mongo_id || notes.orderMongoID;
  const amount = Number(paymentEntity?.amount) || 0;

  if (!noteOrderId && !noteOrderMongoId) {
    return successResponse(res, 200, 'No order reference in webhook notes');
  }

  const orderQuery = [];
  if (noteOrderMongoId) {
    orderQuery.push({ _id: noteOrderMongoId });
  }
  if (noteOrderId) {
    orderQuery.push({ orderId: noteOrderId });
  }

  const order = await Order.findOne(orderQuery.length ? { $or: orderQuery } : {}).lean();
  if (!order) {
    return successResponse(res, 200, 'Order not found for webhook');
  }

  console.log('✅ Razorpay webhook payment captured', {
    orderId: order.orderId,
    orderMongoId: order._id?.toString(),
    paymentId: paymentEntity?.id,
    amount
  });

  if (order.paymentStatus === 'paid') {
    return successResponse(res, 200, 'Order already marked as paid');
  }

  const now = new Date();
  const updateData = {
    paymentStatus: 'paid',
    'payment.status': 'completed',
    'payment.method': 'upi',
    'payment.razorpayPaymentId': paymentEntity?.id || order.payment?.razorpayPaymentId || '',
    'payment.razorpayOrderId': paymentEntity?.order_id || order.payment?.razorpayOrderId || '',
    'payment.transactionId': paymentEntity?.id || order.payment?.transactionId || ''
  };

  await Order.findByIdAndUpdate(order._id, { $set: updateData }, { new: true });

  return successResponse(res, 200, 'Payment captured and marked as paid');
});
