import mongoose from 'mongoose';

const donationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    razorpayOrderId: {
        type: String,
        required: true
    },
    razorpayPaymentId: {
        type: String
    },
    razorpaySignature: {
        type: String
    },
    isAdminCredit: {
        type: Boolean,
        default: true // Donations go to admin account
    },
    donatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Donation = mongoose.model('Donation', donationSchema);

export default Donation;
