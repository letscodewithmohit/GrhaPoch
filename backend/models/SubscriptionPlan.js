import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema(
    {
        planKey: {
            type: String,
            trim: true,
            lowercase: true,
            default: '',
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
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

subscriptionPlanSchema.index({ planKey: 1 }, { unique: true, sparse: true });

export default mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
