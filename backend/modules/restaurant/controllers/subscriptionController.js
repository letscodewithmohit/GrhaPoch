import Restaurant from '../models/Restaurant.js';
import SubscriptionPlan from '../../admin/models/SubscriptionPlan.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { createOrder, verifyPayment } from '../../payment/services/razorpayService.js';
import crypto from 'crypto';

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

        const amount = plan.price * 100; // Convert to paise

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

        return successResponse(res, 200, 'Order created successfully', {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
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

        // Verify signature using centralized service
        const isValid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!isValid) {
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

        const now = new Date();
        const durationDays = plan.durationMonths * 30; // Approximation
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + durationDays);

        restaurant.subscription = {
            planId: planId,
            status: 'active',
            startDate: now,
            endDate: endDate,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id
        };
        restaurant.businessModel = 'Subscription Base';
        restaurant.isActive = true;

        await restaurant.save();

        return successResponse(res, 200, 'Subscription activated successfully', {
            subscription: restaurant.subscription
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return errorResponse(res, 500, 'Failed to verify payment');
    }
};

// Get subscription status
export const getSubscriptionStatus = async (req, res) => {
    try {
        const restaurantId = req.restaurant._id;
        const restaurant = await Restaurant.findById(restaurantId).select('subscription isActive businessModel');

        if (!restaurant) {
            return errorResponse(res, 404, 'Restaurant not found');
        }

        // Optionally populate plan name if needed, or frontend can fetch current plans
        // We'll return just the subscription object. Frontend can lookup plan details.

        return successResponse(res, 200, 'Subscription status retrieved', {
            subscription: restaurant.subscription,
            isActive: restaurant.isActive,
            businessModel: restaurant.businessModel
        });
    } catch (error) {
        console.error('Get status error:', error);
        return errorResponse(res, 500, 'Failed to get subscription status');
    }
};

// Admin: Get all restaurants with subscriptions
export const getAllSubscriptions = async (req, res) => {
    try {
        // Fetch all restaurants to allow admin to manage subscriptions for any restaurant
        const restaurants = await Restaurant.find()
            .select('name email phone subscription isActive createdAt businessModel');

        return successResponse(res, 200, 'Subscriptions retrieved successfully', {
            restaurants
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
        const { status, planId } = req.body;

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
        }

        if (status === 'active') {
            if (!effectivePlanId) {
                return errorResponse(res, 400, 'Cannot activate subscription without a valid plan');
            }

            // If we have a plan object (either fetched now or we should fetch it if it's existing planId)
            if (!plan && effectivePlanId) {
                plan = await SubscriptionPlan.findById(effectivePlanId);
            }

            if (!plan) {
                // Fallback for old string IDs if necessary, or error
                // For now assuming we moved to dynamic plans completely.
                // But let's support old strings just in case logic is mixed, or error out.
                if (['1_month', '6_months', '12_months'].includes(effectivePlanId)) {
                    // Backward compat logic
                    const now = new Date();
                    const durationDays = effectivePlanId === '1_month' ? 30 : effectivePlanId === '6_months' ? 180 : 365;
                    const endDate = new Date(now);
                    endDate.setDate(endDate.getDate() + durationDays);
                    updateFields['subscription.startDate'] = now;
                    updateFields['subscription.endDate'] = endDate;
                } else {
                    return errorResponse(res, 404, 'Plan not found to calculate duration');
                }
            } else {
                const now = new Date();
                const durationDays = plan.durationMonths * 30;
                const endDate = new Date(now);
                endDate.setDate(endDate.getDate() + durationDays);

                updateFields['subscription.startDate'] = now;
                updateFields['subscription.endDate'] = endDate;
            }

            updateFields['isActive'] = true;
            updateFields['businessModel'] = 'Subscription Base';

        } else if (status === 'inactive' || status === 'expired') {
            updateFields['isActive'] = false;
        }

        await Restaurant.findByIdAndUpdate(
            restaurantId,
            { $set: updateFields },
            { new: true, runValidators: false }
        );

        const updatedRestaurant = await Restaurant.findById(restaurantId);

        return successResponse(res, 200, 'Subscription updated successfully', {
            subscription: updatedRestaurant.subscription
        });
    } catch (error) {
        console.error('Update subscription error:', error);
        return errorResponse(res, 500, error.message || 'Failed to update subscription');
    }
};
