import mongoose from 'mongoose';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { createPlan } from '../services/razorpayService.js';

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

const normalizePlanKey = (value) => {
    const base = String(value || '').trim().toLowerCase();
    if (!base) return '';
    return base.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};

const normalizeFeatures = (features, durationMonths) => {
    if (!Array.isArray(features)) {
        return getEffectiveSubscriptionFeatures({ durationMonths });
    }
    const normalized = features
        .map((feature) => (typeof feature === 'string' ? feature.trim() : ''))
        .filter(Boolean);
    return normalized.length > 0 ? normalized : getEffectiveSubscriptionFeatures({ durationMonths });
};

const parseAmount = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
};

const buildRazorpayPlanPayload = ({ name, durationMonths, price, currency, description, planKey, version }) => {
    return {
        period: 'monthly',
        interval: durationMonths,
        item: {
            name,
            amount: Math.round(price * 100),
            currency,
            description: description || ''
        },
        notes: {
            planKey: planKey || '',
            version: Number(version) || 1,
            source: 'admin'
        }
    };
};

// Get all subscription plans (admin)
export const getSubscriptionPlans = async (req, res) => {
    try {
        const includeInactive = String(req.query.all || req.query.includeInactive || '').toLowerCase() === 'true' ||
            String(req.query.all || req.query.includeInactive || '') === '1';
        const planFilter = includeInactive ? {} : { isActive: true };
        const plans = await SubscriptionPlan.find(planFilter)
            .sort({ planKey: 1, version: -1, createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, data: plans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get active subscription plans (for public/restaurant use)
export const getActiveSubscriptionPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1, durationMonths: 1 }).lean();
        res.status(200).json({ success: true, data: plans.map(withEffectiveFeatures) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a new subscription plan
export const createSubscriptionPlan = async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const planKey = normalizePlanKey(req.body?.planKey || name);
        const durationMonths = Number(req.body?.durationMonths);
        const price = parseAmount(req.body?.price);
        const currency = String(req.body?.currency || 'INR').trim().toUpperCase();
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const isPopular = !!req.body?.isPopular;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Plan name is required' });
        }
        if (!planKey) {
            return res.status(400).json({ success: false, message: 'planKey is required' });
        }
        if (!Number.isFinite(durationMonths) || durationMonths < 1) {
            return res.status(400).json({ success: false, message: 'durationMonths must be at least 1' });
        }
        if (price === null) {
            return res.status(400).json({ success: false, message: 'price must be >= 0' });
        }

        const existingActive = await SubscriptionPlan.findOne({ planKey, isActive: true });
        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: `Active plan for key '${planKey}' already exists. Update it instead.`
            });
        }

        const version = 1;
        const razorpayPlan = await createPlan(
            buildRazorpayPlanPayload({
                name,
                durationMonths,
                price,
                currency,
                description,
                planKey,
                version
            })
        );

        const razorpayPlanId = razorpayPlan?.id || '';
        if (!razorpayPlanId) {
            return res.status(500).json({ success: false, message: 'Failed to create Razorpay plan' });
        }

        const razorpayItemId = razorpayPlan?.item?.id || razorpayPlan?.item_id || '';
        const features = normalizeFeatures(req.body?.features, durationMonths);

        const createdPlan = await SubscriptionPlan.create({
            planKey,
            name,
            durationMonths,
            price,
            currency,
            description,
            features,
            isActive: true,
            isPopular,
            razorpayPlanId,
            razorpayItemId,
            version,
            syncStatus: 'synced',
            syncError: ''
        });

        res.status(201).json({
            success: true,
            data: withEffectiveFeatures(createdPlan),
            message: 'Subscription plan created successfully'
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

        if (Object.prototype.hasOwnProperty.call(req.body, 'planKey')) {
            const incomingKey = normalizePlanKey(req.body.planKey);
            if (incomingKey && incomingKey !== existingPlan.planKey) {
                return res.status(400).json({ success: false, message: 'planKey cannot be changed for existing plans' });
            }
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
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'price')) {
            const price = parseAmount(req.body.price);
            if (price === null) {
                return res.status(400).json({ success: false, message: 'price must be >= 0' });
            }
            updates.price = price;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'currency')) {
            const currency = String(req.body.currency || '').trim().toUpperCase();
            if (!currency) {
                return res.status(400).json({ success: false, message: 'currency cannot be empty' });
            }
            updates.currency = currency;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
            updates.description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'isPopular')) {
            updates.isPopular = !!req.body.isPopular;
        }
        const featuresProvided = Object.prototype.hasOwnProperty.call(req.body, 'features');
        if (featuresProvided) {
            updates.features = normalizeFeatures(req.body.features, updates.durationMonths || existingPlan.durationMonths);
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'durationMonths')) {
            updates.features = getEffectiveSubscriptionFeatures({ durationMonths: updates.durationMonths });
        }

        const nextValues = {
            name: updates.name ?? existingPlan.name,
            durationMonths: updates.durationMonths ?? existingPlan.durationMonths,
            price: updates.price ?? existingPlan.price,
            currency: updates.currency ?? existingPlan.currency,
            description: updates.description ?? existingPlan.description,
            features: updates.features ?? existingPlan.features,
            isPopular: updates.isPopular ?? existingPlan.isPopular
        };

        const requiresNewRazorpayPlan =
            nextValues.price !== existingPlan.price ||
            nextValues.durationMonths !== existingPlan.durationMonths ||
            nextValues.currency !== existingPlan.currency ||
            nextValues.name !== existingPlan.name ||
            nextValues.description !== existingPlan.description;

        if (!requiresNewRazorpayPlan) {
            const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true });
            return res.status(200).json({
                success: true,
                data: withEffectiveFeatures(updatedPlan),
                message: 'Subscription plan updated successfully'
            });
        }

        const nextVersion = Math.max(Number(existingPlan.version) || 1, 1) + 1;
        const razorpayPlan = await createPlan(
            buildRazorpayPlanPayload({
                name: nextValues.name,
                durationMonths: nextValues.durationMonths,
                price: nextValues.price,
                currency: nextValues.currency,
                description: nextValues.description,
                planKey: existingPlan.planKey,
                version: nextVersion
            })
        );

        const razorpayPlanId = razorpayPlan?.id || '';
        if (!razorpayPlanId) {
            return res.status(500).json({ success: false, message: 'Failed to create Razorpay plan' });
        }

        const razorpayItemId = razorpayPlan?.item?.id || razorpayPlan?.item_id || '';

        const session = await mongoose.startSession();
        let createdPlan = null;
        try {
            await session.withTransaction(async () => {
                await SubscriptionPlan.updateOne(
                    { _id: existingPlan._id },
                    { $set: { isActive: false } },
                    { session }
                );

                const [newPlan] = await SubscriptionPlan.create([
                    {
                        planKey: existingPlan.planKey,
                        name: nextValues.name,
                        durationMonths: nextValues.durationMonths,
                        price: nextValues.price,
                        currency: nextValues.currency,
                        description: nextValues.description,
                        features: normalizeFeatures(nextValues.features, nextValues.durationMonths),
                        isActive: true,
                        isPopular: nextValues.isPopular,
                        razorpayPlanId,
                        razorpayItemId,
                        version: nextVersion,
                        replacesPlanId: existingPlan._id,
                        syncStatus: 'synced',
                        syncError: ''
                    }
                ], { session });

                createdPlan = newPlan;

                await SubscriptionPlan.updateOne(
                    { _id: existingPlan._id },
                    { $set: { replacedByPlanId: newPlan._id } },
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }

        return res.status(200).json({
            success: true,
            data: withEffectiveFeatures(createdPlan),
            message: 'Subscription plan updated by creating a new version'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete (deactivate) a subscription plan
export const deleteSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await SubscriptionPlan.findById(id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        plan.isActive = false;
        await plan.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription plan deactivated successfully'
        });
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

        const nextStatus = !plan.isActive;
        if (nextStatus) {
            const existingActive = await SubscriptionPlan.findOne({
                planKey: plan.planKey,
                isActive: true,
                _id: { $ne: plan._id }
            });
            if (existingActive) {
                return res.status(409).json({
                    success: false,
                    message: `Another active plan for key '${plan.planKey}' already exists. Deactivate it first.`
                });
            }
        }

        plan.isActive = nextStatus;
        await plan.save();

        return res.status(200).json({
            success: true,
            data: withEffectiveFeatures(plan),
            message: `Subscription plan ${nextStatus ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
