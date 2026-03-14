import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      default: 'GrhaPoch'
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: ''
    },
    phone: {
      countryCode: {
        type: String,
        required: false,
        default: '+91'
      },
      number: {
        type: String,
        required: false,
        trim: true,
        default: ''
      }
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    pincode: {
      type: String,
      trim: true,
      default: ''
    },
    logo: {
      url: {
        type: String,
        default: ''
      },
      publicId: {
        type: String,
        default: ''
      }
    },
    favicon: {
      url: {
        type: String,
        default: ''
      },
      publicId: {
        type: String,
        default: ''
      }
    },
    maintenanceMode: {
      isEnabled: {
        type: Boolean,
        default: false
      },
      startDate: {
        type: Date,
        default: null
      },
      endDate: {
        type: Date,
        default: null
      }
    },
    // Global Delivery Partner cash limit (applies to all delivery partners)
    // Used for "Available cash limit" in delivery Pocket/Wallet UI.
    deliveryCashLimit: {
      type: Number,
      default: 5000,
      min: 0
    },
    // Minimum amount above which delivery boy can withdraw. Withdrawal allowed only when withdrawable amount >= this.
    deliveryWithdrawalLimit: {
      type: Number,
      default: 100,
      min: 0
    },
    donationAmounts: {
      type: [Number],
      default: [20, 50, 100]
    },
    deliveryTipAmounts: {
      type: [Number],
      default: [10, 20, 30, 50]
    },
    // New: Subscription expiry warning threshold in days
    subscriptionExpiryWarningDays: {
      type: Number,
      default: 5,
      min: 1
    },
    // Dining activation fee for commission-based restaurants
    diningActivationFee: {
      type: Number,
      default: 0,
      min: 0
    },
    // Bank deposit details for delivery cash deposits
    bankName: {
      type: String,
      trim: true,
      default: ''
    },
    accountHolder: {
      type: String,
      trim: true,
      default: ''
    },
    accountNumber: {
      type: String,
      trim: true,
      default: ''
    },
    ifsc: {
      type: String,
      trim: true,
      default: ''
    },
    branch: {
      type: String,
      trim: true,
      default: ''
    },
    approvalTime: {
      type: String,
      trim: true,
      default: ''
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
businessSettingsSchema.index({ createdAt: -1 });

// Ensure only one document exists
businessSettingsSchema.statics.getSettings = async function () {
  try {
    let settings = await this.findOne();
    if (!settings) {
      settings = await this.create({
        companyName: 'GrhaPoch',
        email: 'info@appzetofood.com',
        phone: {
          countryCode: '+91',
          number: ''
        },
        deliveryCashLimit: 5000,
        deliveryWithdrawalLimit: 100,
        diningActivationFee: 0,
        donationAmounts: [20, 50, 100],
        deliveryTipAmounts: [10, 20, 30, 50]
      });
    }
    // Ensure newly added defaults exist for older documents
    let changed = false;
    if (!Number.isFinite(Number(settings.deliveryCashLimit))) {
      settings.deliveryCashLimit = 5000;
      changed = true;
    }
    if (!Number.isFinite(Number(settings.deliveryWithdrawalLimit))) {
      settings.deliveryWithdrawalLimit = 100;
      changed = true;
    }
    if (changed) {
      await settings.save();
    }
    return settings;
  } catch (error) {
    console.error('Error in getSettings:', error);
    // If creation fails, try to return existing or create minimal document
    let settings = await this.findOne();
    if (!settings) {
      // Create with minimal required fields
      settings = new this({
        companyName: 'GrhaPoch',
        email: 'info@appzetofood.com',
        phone: {
          countryCode: '+91',
          number: ''
        },
        deliveryCashLimit: 5000,
        deliveryWithdrawalLimit: 100,
        diningActivationFee: 0,
        donationAmounts: [20, 50, 100],
        deliveryTipAmounts: [10, 20, 30, 50]
      });
      await settings.save();
    }
    return settings;
  }
};

export default mongoose.model('BusinessSettings', businessSettingsSchema);

