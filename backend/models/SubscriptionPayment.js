import mongoose from 'mongoose';

const subscriptionPaymentSchema = new mongoose.Schema({
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: true,
        index: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
        required: true
    },
    planName: {
        type: String
    },
    razorpayPlanId: {
        type: String,
        trim: true,
        default: ''
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    razorpayPaymentId: {
        type: String,
        default: null,
        sparse: true
    },
    razorpayOrderId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'refunded', 'failed'],
        default: 'pending'
    },
    paymentDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    // Subscription period covered by this payment
    startDate: {
        type: Date,
        default: null
    },
    endDate: {
        type: Date,
        default: null
    },
    // Whether this was a fresh subscription or a renewal of an existing one
    renewalType: {
        type: String,
        enum: ['new', 'renewal'],
        default: 'new'
    },
    source: {
        type: String,
        enum: ['create_order', 'verify_api', 'webhook', 'reconcile'],
        default: 'create_order'
    },
    lastError: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes
subscriptionPaymentSchema.index({ createdAt: -1 });
subscriptionPaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
subscriptionPaymentSchema.index({ razorpayOrderId: 1 });
subscriptionPaymentSchema.index({ status: 1, createdAt: -1 });

const SubscriptionPayment = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);

export default SubscriptionPayment;

