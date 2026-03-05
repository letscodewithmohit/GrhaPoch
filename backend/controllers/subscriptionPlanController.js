
import SubscriptionPlan from '../models/SubscriptionPlan.js';

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
        const plans = await SubscriptionPlan.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: plans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get active subscription plans (for public/restaurant use)
export const getActiveSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
        res.status(200).json({ success: true, data: plans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a new subscription plan
export const createSubscriptionPlan = async (req, res) => {
    try {
        const { name, durationMonths, price, description, features, isPopular } = req.body;
        const normalizedFeatures = Array.isArray(features)
            ? features.map((feature) => (typeof feature === 'string' ? feature.trim() : '')).filter(Boolean)
            : [];

        const newPlan = new SubscriptionPlan({
            name,
            durationMonths,
            price,
            description,
            features: normalizedFeatures,
            isPopular,
        });

        const savedPlan = await newPlan.save();
        res.status(201).json({ success: true, data: withEffectiveFeatures(savedPlan), message: 'Subscription plan created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a subscription plan
export const updateSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (Object.prototype.hasOwnProperty.call(updates, 'features')) {
            updates.features = Array.isArray(updates.features)
                ? updates.features.map((feature) => (typeof feature === 'string' ? feature.trim() : '')).filter(Boolean)
                : [];
        }

        const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true });

        if (!updatedPlan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        res.status(200).json({ success: true, data: withEffectiveFeatures(updatedPlan), message: 'Subscription plan updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a subscription plan
export const deleteSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedPlan = await SubscriptionPlan.findByIdAndDelete(id);

        if (!deletedPlan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        res.status(200).json({ success: true, message: 'Subscription plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Toggle subscription plan status
export const toggleSubscriptionPlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await SubscriptionPlan.findById(id);

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        plan.isActive = !plan.isActive;
        await plan.save();

        res.status(200).json({ success: true, data: plan, message: 'Subscription plan status updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
