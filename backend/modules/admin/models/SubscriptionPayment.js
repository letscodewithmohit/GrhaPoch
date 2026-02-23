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
        required: true,
        unique: true
    },
    razorpayOrderId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['success', 'refunded', 'failed'],
        default: 'success'
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
    }
}, {
    timestamps: true
});

// Indexes
subscriptionPaymentSchema.index({ createdAt: -1 });

const SubscriptionPayment = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);

export default SubscriptionPayment;

