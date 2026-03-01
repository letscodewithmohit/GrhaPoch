import mongoose from 'mongoose';

const razorpaySchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      default: ''
    },
    paymentId: {
      type: String,
      default: ''
    },
    signature: {
      type: String,
      default: ''
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const paymentLogSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['initiated', 'failed', 'verified'],
      required: true
    },
    orderId: {
      type: String,
      default: ''
    },
    paymentId: {
      type: String,
      default: ''
    },
    message: {
      type: String,
      default: ''
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const userAdvertisementSchema = new mongoose.Schema(
  {
    adId: {
      type: String,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    bannerImage: {
      type: String,
      required: true
    },
    bannerPublicId: {
      type: String,
      default: ''
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140
    },
    websiteUrl: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2048
    },
    durationDays: {
      type: Number,
      min: 1,
      max: 365,
      default: null
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'payment_pending', 'active', 'expired', 'rejected'],
      default: 'pending',
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'failed'],
      default: 'unpaid',
      index: true
    },
    paymentId: {
      type: String,
      default: ''
    },
    razorpay: {
      type: razorpaySchema,
      default: () => ({})
    },
    paymentLogs: {
      type: [paymentLogSchema],
      default: []
    },
    startDate: {
      type: Date,
      default: null,
      index: true
    },
    endDate: {
      type: Date,
      default: null,
      index: true
    },
    position: {
      type: String,
      enum: ['home_top', 'home_middle', 'home_bottom'],
      default: 'home_top',
      index: true
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 400
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 400
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

userAdvertisementSchema.index({ status: 1, createdAt: -1 });
userAdvertisementSchema.index({ userId: 1, status: 1, createdAt: -1 });
userAdvertisementSchema.index({ userId: 1, status: 1, paymentStatus: 1, createdAt: -1 });
userAdvertisementSchema.index({ isActive: 1, position: 1, startDate: 1, endDate: 1 });

userAdvertisementSchema.pre('save', function (next) {
  if (!this.adId) {
    const now = Date.now().toString().slice(-9);
    const random = Math.floor(100 + Math.random() * 900).toString();
    this.adId = `UAD${now}${random}`;
  }
  next();
});

export default mongoose.model('UserAdvertisement', userAdvertisementSchema);
