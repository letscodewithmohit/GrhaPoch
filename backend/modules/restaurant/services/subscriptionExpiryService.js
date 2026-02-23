import Restaurant from '../models/Restaurant.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import RestaurantNotification from '../models/RestaurantNotification.js';
import AuditLog from '../../admin/models/AuditLog.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';

/**
 * CRON JOB #1 — Run every hour
 * Expire all subscriptions whose endDate has passed.
 * - Archives current subscription into subscriptionHistory
 * - Switches businessModel to Commission Base
 * - Resets commission to 10%
 * - Creates in-app notification for restaurant
 * - Creates audit log entry
 */
export async function processSubscriptionExpiries() {
    try {
        const now = new Date();

        // Only fetch restaurants that are active and overdue
        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base',
            'subscription.status': 'active',
            'subscription.endDate': { $lt: now }
        });

        let expiredCount = 0;

        for (const restaurant of restaurants) {
            try {
                // Archive old subscription into history
                if (!restaurant.subscriptionHistory) {
                    restaurant.subscriptionHistory = [];
                }

                if (restaurant.subscription?.planId) {
                    restaurant.subscriptionHistory.push({
                        planId: restaurant.subscription.planId,
                        planName: restaurant.subscription.planName,
                        status: 'expired',
                        startDate: restaurant.subscription.startDate,
                        endDate: restaurant.subscription.endDate,
                        paymentId: restaurant.subscription.paymentId,
                        orderId: restaurant.subscription.orderId,
                        activatedAt: restaurant.subscription.startDate || restaurant.subscription.endDate
                    });
                }

                // Expire and switch to Commission Base
                restaurant.businessModel = 'Commission Base';
                restaurant.subscription.status = 'expired';

                await restaurant.save();

                // Reset commission to default (10%) — only update if record exists
                // (upsert avoided because 'createdBy' is required in schema)
                await RestaurantCommission.updateOne(
                    { restaurant: restaurant._id },
                    {
                        $set: {
                            'defaultCommission.value': 10,
                            'defaultCommission.type': 'percentage'
                        }
                    }
                );

                // In-app notification
                await RestaurantNotification.create({
                    restaurant: restaurant._id,
                    title: 'Subscription Expired',
                    message: `Your ${restaurant.subscription.planName || 'subscription'} plan has expired. You have been switched to Commission Base (10%). Subscribe again to enjoy 0% commission.`,
                    type: 'subscription_expired'
                });

                // Audit log
                await AuditLog.createLog({
                    entityType: 'restaurant',
                    entityId: restaurant._id,
                    action: 'subscription_expired',
                    actionType: 'update',
                    performedBy: {
                        type: 'system',
                        userId: 'system',
                        name: 'Subscription Cron'
                    },
                    description: `Subscription auto-expired. Switched to Commission Base.`,
                    metadata: {
                        planName: restaurant.subscription.planName,
                        expiredAt: now.toISOString()
                    }
                });

                expiredCount++;
                console.log(`[Subscription Expiry] Expired: ${restaurant.name} (${restaurant._id})`);
            } catch (err) {
                console.error(`[Subscription Expiry] Failed for restaurant ${restaurant._id}:`, err);
            }
        }

        return {
            processed: restaurants.length,
            expired: expiredCount,
            message: `Processed ${restaurants.length} restaurants, expired ${expiredCount} subscriptions.`
        };
    } catch (error) {
        console.error('[Subscription Expiry Cron] Critical error:', error);
        throw error;
    }
}

/**
 * CRON JOB #2 — Run once daily at 9:00 AM
 * Send warning notifications to restaurants whose subscription
 * is within the warning window (e.g. last 3 days).
 * Avoids duplicate notifications by checking if one was already sent today.
 */
export async function processSubscriptionWarnings() {
    try {
        const now = new Date();

        // Fetch dynamic warning threshold
        const settings = await BusinessSettings.getSettings();
        const warningDays = settings?.subscriptionExpiryWarningDays || 5;

        // Warning window: subscriptions expiring within warningDays from now
        const warningCutoff = new Date(now);
        warningCutoff.setDate(warningCutoff.getDate() + warningDays);

        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base',
            'subscription.status': 'active',
            'subscription.endDate': { $gt: now, $lte: warningCutoff }
        });

        let warnedCount = 0;

        for (const restaurant of restaurants) {
            try {
                const endDate = new Date(restaurant.subscription.endDate);
                const daysLeft = Math.max(1, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
                const expireStr = endDate.toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });

                // Check if a warning notification was already sent today to avoid spam
                const todayStart = new Date(now);
                todayStart.setHours(0, 0, 0, 0);

                const alreadySentToday = await RestaurantNotification.findOne({
                    restaurant: restaurant._id,
                    type: 'subscription_expired',   // reuse the type field
                    title: 'Subscription Expiring Soon',
                    createdAt: { $gte: todayStart }
                });

                if (alreadySentToday) continue;

                await RestaurantNotification.create({
                    restaurant: restaurant._id,
                    title: 'Subscription Expiring Soon',
                    message: `Your ${restaurant.subscription.planName || 'subscription'} plan expires on ${expireStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left). Renew now to avoid interruption.`,
                    type: 'subscription_expired'
                });

                warnedCount++;
                console.log(`[Subscription Warning] Notified: ${restaurant.name} — ${daysLeft} days left`);
            } catch (err) {
                console.error(`[Subscription Warning] Failed for restaurant ${restaurant._id}:`, err);
            }
        }

        return {
            processed: restaurants.length,
            warned: warnedCount,
            message: `Checked ${restaurants.length} near-expiry subscriptions, sent ${warnedCount} warnings.`
        };
    } catch (error) {
        console.error('[Subscription Warning Cron] Critical error:', error);
        throw error;
    }
}
