
import SubscriptionPlan from '../models/SubscriptionPlan.js';

// Get all subscription plans
export const getSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get active subscription plans (for public/restaurant use)
export const getActiveSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
        res.status(200).json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a new subscription plan
export const createSubscriptionPlan = async (req, res) => {
    try {
        const { name, durationMonths, price, description, features, isPopular } = req.body;

        const newPlan = new SubscriptionPlan({
            name,
            durationMonths,
            price,
            description,
            features,
            isPopular,
        });

        const savedPlan = await newPlan.save();
        res.status(201).json({ success: true, data: savedPlan, message: 'Subscription plan created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a subscription plan
export const updateSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true });

        if (!updatedPlan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        res.status(200).json({ success: true, data: updatedPlan, message: 'Subscription plan updated successfully' });
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
