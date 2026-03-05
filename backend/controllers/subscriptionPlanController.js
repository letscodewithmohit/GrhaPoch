
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import {
    FIXED_SUBSCRIPTION_PLAN_KEYS,
    FIXED_SUBSCRIPTION_PLAN_NAMES,
    getFixedPlanByDoc,
    sortPlansByFixedOrder
} from '../constants/subscriptionPlans.js';

const getEffectiveSubscriptionFeatures = (plan = {}) => {
    const durationMonths = Math.max(Number(plan?.durationMonths) || 1, 1);
    return [
        `Plan validity: ${durationMonths} month${durationMonths > 1 ? 's' : ''}`,
        '0% commission on orders while subscription is active',
        'Dining activation payment waiver eligibility after dining request approval',
    ];
};

const withEffectiveFeatures = (planDoc) => {
    const plainPlan = typeof planDoc?.toObject === 'function' ? planDoc.toObject() : planDoc;
    return {
        ...plainPlan,
        effectiveFeatures: getEffectiveSubscriptionFeatures(plainPlan),
    };
};

// Get all subscription plans
export const getSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({
            $or: [
                { planKey: { $in: FIXED_SUBSCRIPTION_PLAN_KEYS } },
                { name: { $in: FIXED_SUBSCRIPTION_PLAN_NAMES } }
            ]
        }).lean();

        const sortedPlans = sortPlansByFixedOrder(plans);
        res.status(200).json({ success: true, data: sortedPlans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get active subscription plans (for public/restaurant use)
export const getActiveSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({
            $and: [
                {
                    $or: [
                        { planKey: { $in: FIXED_SUBSCRIPTION_PLAN_KEYS } },
                        { name: { $in: FIXED_SUBSCRIPTION_PLAN_NAMES } }
                    ]
                },
                { isActive: true }
            ]
        }).lean();

        const sortedPlans = sortPlansByFixedOrder(plans);
        res.status(200).json({ success: true, data: sortedPlans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a new subscription plan
export const createSubscriptionPlan = async (req, res) => {
    try {
        return res.status(403).json({
            success: false,
            message: 'Create plan is disabled. Only Basic, Growth, and Premium plans are allowed.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a subscription plan
export const updateSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const existingPlan = await SubscriptionPlan.findById(id);
        if (!existingPlan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        const fixedPlan = getFixedPlanByDoc(existingPlan);
        if (!fixedPlan) {
            return res.status(403).json({
                success: false,
                message: 'Only the fixed 3 plans can be updated.'
            });
        }

        const updates = {};
        if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
            const nextName = String(req.body.name || '').trim();
            if (!nextName) {
                return res.status(400).json({ success: false, message: 'Plan name cannot be empty' });
            }
            updates.name = nextName;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'durationMonths')) {
            const durationMonths = Number(req.body.durationMonths);
            if (!Number.isFinite(durationMonths) || durationMonths < 1) {
                return res.status(400).json({ success: false, message: 'durationMonths must be at least 1' });
            }
            updates.durationMonths = durationMonths;
            updates.features = getEffectiveSubscriptionFeatures({ durationMonths });
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'price')) {
            const price = Number(req.body.price);
            if (!Number.isFinite(price) || price < 0) {
                return res.status(400).json({ success: false, message: 'price must be >= 0' });
            }
            updates.price = price;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
            updates.description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'isPopular')) {
            updates.isPopular = !!req.body.isPopular;
        }

        // Keep fixed plans always active and preserve stable mapping.
        updates.isActive = true;
        updates.planKey = fixedPlan.key;
        updates.razorpayPlanId = fixedPlan.razorpayPlanId;

        const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true });

        res.status(200).json({ success: true, data: withEffectiveFeatures(updatedPlan), message: 'Subscription plan updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a subscription plan
export const deleteSubscriptionPlan = async (req, res) => {
    try {
        return res.status(403).json({
            success: false,
            message: 'Delete plan is disabled. Fixed 3 plans must remain available.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Toggle subscription plan status
export const toggleSubscriptionPlanStatus = async (req, res) => {
    try {
        return res.status(403).json({
            success: false,
            message: 'Plan status toggle is disabled. Fixed 3 plans stay active.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
