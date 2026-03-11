import mongoose from 'mongoose';

const deliveryBankDepositSchema = new mongoose.Schema(
  {
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    slip: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' }
    },
    slips: [
      {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' }
      }
    ],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

deliveryBankDepositSchema.index({ createdAt: -1 });

export default mongoose.model('DeliveryBankDeposit', deliveryBankDepositSchema);
