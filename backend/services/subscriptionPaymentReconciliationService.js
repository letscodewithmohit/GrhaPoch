import SubscriptionPayment from '../models/SubscriptionPayment.js';
import { fetchOrder, fetchOrderPayments, fetchSubscription, fetchSubscriptionPayments } from './razorpayService.js';
import { activateSubscriptionTx, markSubscriptionPaymentFailed } from '../controllers/subscriptionController.js';
import mongoose from 'mongoose';

const STALE_PENDING_HOURS = 24;

export async function reconcilePendingSubscriptionPayments({ maxRecords = 25, lookbackHours = 72 } = {}) {
  const now = new Date();
  const lookbackCutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - STALE_PENDING_HOURS * 60 * 60 * 1000);

  const pendingPayments = await SubscriptionPayment.find({
    status: 'pending',
    createdAt: { $gte: lookbackCutoff },
    $or: [
      { razorpaySubscriptionId: { $exists: true, $ne: '' } },
      { razorpayOrderId: { $exists: true, $ne: '' } }
    ]
  })
    .sort({ createdAt: 1 })
    .limit(maxRecords);

  let checked = 0;
  let activated = 0;
  let failed = 0;

  for (const pending of pendingPayments) {
    checked++;
    try {
      if (pending.razorpaySubscriptionId) {
        const subscription = await fetchSubscription(pending.razorpaySubscriptionId);
        const subscriptionStatus = String(subscription?.status || '').toLowerCase();

        if (subscriptionStatus === 'active' || subscriptionStatus === 'authenticated') {
          let paymentId = pending.razorpayPaymentId || '';
          let paymentDate = subscription?.current_start ? new Date(Number(subscription.current_start) * 1000) : new Date();

          if (!paymentId) {
            const payments = await fetchSubscriptionPayments(pending.razorpaySubscriptionId);
            const capturedPayment = payments.find((item) => String(item?.status || '').toLowerCase() === 'captured');
            const fallbackPayment = payments[0];
            const selectedPayment = capturedPayment || fallbackPayment;
            paymentId = selectedPayment?.id || '';
            if (selectedPayment?.created_at) {
              paymentDate = new Date(Number(selectedPayment.created_at) * 1000);
            }
          }

          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await activateSubscriptionTx({
                restaurantId: pending.restaurantId,
                planId: pending.planId,
                razorpaySubscriptionId: pending.razorpaySubscriptionId,
                razorpayPaymentId: paymentId || null,
                paymentDate,
                source: 'reconcile',
                session
              });
            });
          } finally {
            await session.endSession();
          }

          activated++;
          continue;
        }

        // If a subscription stays pending for long, mark it failed for clean retry.
        if (pending.createdAt <= staleCutoff) {
          await markSubscriptionPaymentFailed({
            razorpaySubscriptionId: pending.razorpaySubscriptionId,
            razorpayPaymentId: pending.razorpayPaymentId || null,
            message: `Subscription still ${subscriptionStatus || 'pending'} after ${STALE_PENDING_HOURS} hours`,
            source: 'reconcile'
          });
          failed++;
        }
        continue;
      }

      if (pending.razorpayOrderId) {
        const order = await fetchOrder(pending.razorpayOrderId);
        const orderStatus = String(order?.status || '').toLowerCase();

        if (orderStatus === 'paid') {
          let paymentId = pending.razorpayPaymentId || '';
          let paymentDate = order?.created_at ? new Date(Number(order.created_at) * 1000) : new Date();

          if (!paymentId) {
            const payments = await fetchOrderPayments(pending.razorpayOrderId);
            const capturedPayment = payments.find((item) => String(item?.status || '').toLowerCase() === 'captured');
            const fallbackPayment = payments[0];
            const selectedPayment = capturedPayment || fallbackPayment;
            paymentId = selectedPayment?.id || '';
            if (selectedPayment?.created_at) {
              paymentDate = new Date(Number(selectedPayment.created_at) * 1000);
            }
          }

          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await activateSubscriptionTx({
                restaurantId: pending.restaurantId,
                planId: pending.planId,
                razorpayOrderId: pending.razorpayOrderId,
                razorpayPaymentId: paymentId || null,
                paymentDate,
                source: 'reconcile',
                session
              });
            });
          } finally {
            await session.endSession();
          }

          activated++;
          continue;
        }

        // If an order stays pending for long, mark it failed for clean retry.
        if (pending.createdAt <= staleCutoff) {
          await markSubscriptionPaymentFailed({
            razorpayOrderId: pending.razorpayOrderId,
            razorpayPaymentId: pending.razorpayPaymentId || null,
            message: `Order still ${orderStatus || 'pending'} after ${STALE_PENDING_HOURS} hours`,
            source: 'reconcile'
          });
          failed++;
        }
      }
    } catch (error) {
      await markSubscriptionPaymentFailed({
        razorpayOrderId: pending.razorpayOrderId || null,
        razorpaySubscriptionId: pending.razorpaySubscriptionId || null,
        razorpayPaymentId: pending.razorpayPaymentId || null,
        message: error.message || 'Reconciliation failed',
        source: 'reconcile'
      });
      failed++;
    }
  }

  return {
    checked,
    activated,
    failed,
    message: `Checked ${checked} pending subscription payment(s), activated ${activated}, failed ${failed}.`
  };
}
