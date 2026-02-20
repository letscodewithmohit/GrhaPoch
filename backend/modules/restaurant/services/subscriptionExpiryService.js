import Restaurant from '../models/Restaurant.js';
import { checkSubscriptionExpiry } from '../controllers/subscriptionController.js';

/**
 * Process all restaurants to check for expired subscriptions
 */
export async function processSubscriptionExpiries() {
    try {
        // Find restaurants with active subscriptions
        const restaurants = await Restaurant.find({
            businessModel: 'Subscription Base',
            'subscription.status': 'active'
        });

        let expiredCount = 0;
        for (const restaurant of restaurants) {
            const now = new Date();
            const endDate = new Date(restaurant.subscription.endDate);

            if (endDate < now) {
                await checkSubscriptionExpiry(restaurant);
                expiredCount++;
            }
        }

        return {
            processed: restaurants.length,
            expired: expiredCount,
            message: `Processed ${restaurants.length} restaurants, found ${expiredCount} expired subscriptions.`
        };
    } catch (error) {
        console.error('Error processing subscription expiries:', error);
        throw error;
    }
}
