import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      default: ''
    },
    publicId: {
      type: String,
      default: ''
    },
    resourceType: {
      type: String,
      default: ''
    },
    originalName: {
      type: String,
      default: ''
    },
    size: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const bannerMetaSchema = new mongoose.Schema(
  {
    width: {
      type: Number,
      default: 0
    },
    height: {
      type: Number,
      default: 0
    },
    originalName: {
      type: String,
      default: ''
    },
    size: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

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

const advertisementSchema = new mongoose.Schema(
  {
    adId: {
      type: String,
      unique: true,
      index: true
    },
    adType: {
      type: String,
      enum: ['legacy', 'restaurant_banner'],
      default: 'legacy',
      index: true
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
      alias: 'restaurantId'
    },
    category: {
      type: String,
      enum: ['Video Promotion', 'Restaurant Promotion', 'Image Promotion', 'Banner Promotion'],
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 800
    },
    fileDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300
    },
    videoDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300
    },
    bannerImage: {
      type: String,
      default: ''
    },
    bannerPublicId: {
      type: String,
      default: ''
    },
    bannerMeta: {
      type: bannerMetaSchema,
      default: () => ({})
    },
    durationDays: {
      type: Number,
      min: 1,
      default: null
    },
    pricePerDay: {
      type: Number,
      min: 0,
      default: 0
    },
    price: {
      type: Number,
      min: 0,
      default: 0
    },
    startDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    endDate: {
      type: Date,
      default: null,
      index: true
    },
    validityDate: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paused', 'rejected', 'expired', 'payment_pending', 'active'],
      default: 'pending',
      index: true
    },
    priority: {
      type: Number,
      min: 1,
      default: null,
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid'],
      default: 'unpaid',
      index: true
    },
    pauseNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 400
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
    fileMedia: {
      type: mediaSchema,
      default: null
    },
    videoMedia: {
      type: mediaSchema,
      default: null
    },
    approvalDate: {
      type: Date,
      default: null
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    razorpay: {
      type: razorpaySchema,
      default: () => ({})
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

advertisementSchema.index({ status: 1, adType: 1, startDate: 1, endDate: 1, isDeleted: 1 });
advertisementSchema.index({ restaurant: 1, adType: 1, status: 1, startDate: 1, endDate: 1 });

advertisementSchema.pre('save', function (next) {
  if (!this.adId) {
    const now = Date.now().toString().slice(-9);
    const random = Math.floor(100 + Math.random() * 900).toString();
    this.adId = `AD${now}${random}`;
  }

  if (!this.endDate && this.validityDate) {
    this.endDate = this.validityDate;
  }

  if (!this.validityDate && this.endDate) {
    this.validityDate = this.endDate;
  }

  if (!this.approvedBy && this.reviewedBy) {
    this.approvedBy = this.reviewedBy;
  }

  next();
});

export default mongoose.model('Advertisement', advertisementSchema);
