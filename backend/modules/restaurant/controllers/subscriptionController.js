import Restaurant from '../models/Restaurant.js';
import SubscriptionPlan from '../../admin/models/SubscriptionPlan.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { createOrder, verifyPayment } from '../../payment/services/razorpayService.js';
import crypto from 'crypto';
import AuditLog from '../../admin/models/AuditLog.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import RestaurantNotification from '../models/RestaurantNotification.js';
import mongoose from 'mongoose';
import SubscriptionPayment from '../../admin/models/SubscriptionPayment.js';

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
            planName: plan.name,
            status: 'active',
            startDate: now,
            endDate: endDate,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id
        };
        restaurant.businessModel = 'Subscription Base';
        restaurant.isActive = true;
        restaurant.dishLimit = 0; // Set to 0 (unlimited) for everyone

        await restaurant.save();

        // Update Commission to 0 for Subscription Base
        await RestaurantCommission.findOneAndUpdate(
            { restaurant: restaurant._id },
            {
                $set: {
                    "defaultCommission.value": 0,
                    "defaultCommission.type": "percentage"
                }
            },
            { upsert: true, new: true }
        );

        // Save subscription payment record

        // Save subscription payment record for revenue tracking
        try {
            await SubscriptionPayment.create({
                restaurantId: restaurant._id,
                planId: plan._id,
                planName: plan.name,
                amount: plan.price,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                status: 'success',
                paymentDate: now
            });
        } catch (paymentError) {
            console.error('Error saving subscription payment record:', paymentError);
            // Don't fail the activation, just log error
        }
        try {
            await AuditLog.createLog({
                entityType: 'restaurant',
                entityId: restaurantId,
                action: 'upgrade_to_subscription',
                actionType: 'update',
                performedBy: {
                    type: 'restaurant',
                    userId: restaurantId,
                    name: restaurant.name
                },
                description: `Restaurant upgraded to ${plan.name} subscription`,
                metadata: {
                    planId: planId,
                    planName: plan.name,
                    previousModel: 'Commission Base',
                    newModel: 'Subscription Base',
                    paymentId: razorpay_payment_id
                }
            });

            // Also log in commission change if needed (standardize)
            await AuditLog.createLog({
                entityType: 'commission',
                entityId: restaurantId,
                action: 'business_model_changed',
                actionType: 'commission_change',
                performedBy: {
                    type: 'restaurant',
                    userId: restaurantId,
                    name: restaurant.name
                },
                commissionChange: {
                    restaurantId: restaurantId,
                    newValue: 0,
                    newType: 'percentage',
                    reason: `Switched to Subscription Mode (${plan.name})`
                },
                description: `Restaurant commission set to 0% due to subscription upgrade`
            });
        } catch (logError) {
            console.error('Error creating audit log for subscription:', logError);
        }

        return successResponse(res, 200, 'Subscription activated successfully', {
            subscription: restaurant.subscription
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return errorResponse(res, 500, 'Failed to verify payment');
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
            console.log(`Subscription expired for restaurant ${restaurant._id}. Switching to Commission Base.`);

            restaurant.businessModel = 'Commission Base';
            restaurant.subscription.status = 'expired';
            // Set dish limit to 0 (unlimited) for everyone
            restaurant.dishLimit = 0;

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
                await RestaurantCommission.findOneAndUpdate(
                    { restaurant: restaurant._id },
                    {
                        $set: {
                            "defaultCommission.value": 10, // Default fallback
                            "defaultCommission.type": "percentage"
                        }
                    },
                    { upsert: true }
                );

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
        let restaurant = await Restaurant.findById(restaurantId).select('subscription isActive businessModel dishLimit');

        if (!restaurant) {
            return errorResponse(res, 404, 'Restaurant not found');
        }

        // Check for expiry
        restaurant = await checkSubscriptionExpiry(restaurant);

        let daysRemaining = null;
        let showWarning = false;

        if (restaurant.businessModel === 'Subscription Base' && restaurant.subscription?.status === 'active') {
            const now = new Date();
            const endDate = new Date(restaurant.subscription.endDate);
            const diffTime = endDate - now;
            daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            if (daysRemaining <= 5) {
                showWarning = true;
            }
        }

        return successResponse(res, 200, 'Subscription status retrieved', {
            subscription: restaurant.subscription,
            isActive: restaurant.isActive,
            businessModel: restaurant.businessModel,
            dishLimit: restaurant.dishLimit,
            daysRemaining,
            showWarning
        });
    } catch (error) {
        console.error('Get status error:', error);
        return errorResponse(res, 500, 'Failed to get subscription status');
    }
};

// Admin: Get all restaurants with subscriptions
export const getAllSubscriptions = async (req, res) => {
    try {
        // Fetch all restaurants with subscription model or pending requests
        const restaurants = await Restaurant.find({
            $or: [
                { businessModel: 'Subscription Base' },
                { 'subscription.status': 'pending_approval' }
            ]
        })
            .select('name email phone subscription isActive createdAt businessModel')
            .lean();

        // Get all unique plan IDs
        const planIds = [...new Set(restaurants
            .map(r => r.subscription?.planId)
            .filter(id => id && id.match(/^[0-9a-fA-F]{24}$/)) // Only valid ObjectIds
        )];

        // Fetch plans
        const plans = await SubscriptionPlan.find({ _id: { $in: planIds } });
        const planMap = plans.reduce((acc, plan) => {
            acc[plan._id.toString()] = plan;
            return acc;
        }, {});

        // Attach plan details
        const restaurantsWithPlans = restaurants.map(restaurant => {
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
            restaurants: restaurantsWithPlans
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
            updateFields['dishLimit'] = plan ? plan.dishLimit : 0; // Fallback to 0 (unlimited) for legacy plans

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
                    $set: {
                        "defaultCommission.value": 0,
                        "defaultCommission.type": "percentage"
                    }
                },
                { upsert: true }
            );
        } else if (status === 'inactive' || status === 'expired') {
            // Reset to default commission (e.g. 10%) if subscription is cancelled
            await RestaurantCommission.findOneAndUpdate(
                { restaurant: restaurantId },
                {
                    $set: {
                        "defaultCommission.value": 10,
                        "defaultCommission.type": "percentage"
                    }
                },
                { upsert: true }
            );
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
