import mongoose from 'mongoose';

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['processing', 'processed', 'ignored', 'failed'],
      default: 'processing',
      index: true
    },
    attempts: {
      type: Number,
      default: 1
    },
    errorMessage: {
      type: String,
      default: ''
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    processedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

razorpayWebhookEventSchema.index({ createdAt: -1 });

const RazorpayWebhookEvent = mongoose.model('RazorpayWebhookEvent', razorpayWebhookEventSchema);

export default RazorpayWebhookEvent;

