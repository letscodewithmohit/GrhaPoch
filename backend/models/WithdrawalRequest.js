import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
    default: 'Pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['admin_select', 'bank_transfer', 'upi', 'qr_code', 'card'],
    default: 'admin_select'
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },
  upiId: String,
  qrCode: {
    url: String,
    publicId: String
  },
  paymentScreenshot: {
    url: String,
    publicId: String
  },
  cardDetails: {
    last4Digits: String,
    cardType: String
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    sparse: true
  },
  rejectionReason: String,
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    sparse: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RestaurantWallet',
    sparse: true
  },
  // Additional restaurant info for quick access
  restaurantName: String,
  restaurantIdString: String
}, {
  timestamps: true
});

// Indexes
withdrawalRequestSchema.index({ restaurantId: 1, status: 1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ createdAt: -1 });

export default mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

