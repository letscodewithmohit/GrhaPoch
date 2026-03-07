import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
    {
        planKey: {
            type: String,
            trim: true,
            lowercase: true,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        durationMonths: {
            type: Number,
            required: true,
            min: 1,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'INR',
            trim: true,
            uppercase: true,
        },
        description: {
            type: String,
            default: '',
        },
        features: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isPopular: {
            type: Boolean,
            default: false,
        },
        razorpayPlanId: {
            type: String,
            trim: true,
            required: true,
        },
        razorpayItemId: {
            type: String,
            trim: true,
            default: '',
        },
        version: {
            type: Number,
            default: 1,
            min: 1,
        },
        replacesPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPlan',
            default: null,
        },
        replacedByPlanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPlan',
            default: null,
        },
        syncStatus: {
            type: String,
            enum: ['synced', 'error'],
            default: 'synced',
        },
        syncError: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Keep exactly one active version per planKey.
subscriptionPlanSchema.index(
    { planKey: 1, isActive: 1 },
    {
        unique: true,
        partialFilterExpression: {
            isActive: true,
            planKey: { $exists: true, $type: 'string' },
        },
    }
);
subscriptionPlanSchema.index({ planKey: 1, version: 1 }, { unique: true });
subscriptionPlanSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
