import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
    {
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
        dishLimit: {
            type: Number,
            default: 0, // 0 means unlimited
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
