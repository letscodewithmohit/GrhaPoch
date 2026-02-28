import mongoose from 'mongoose';

const advertisementSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
      default: 150
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

export default mongoose.model('AdvertisementSetting', advertisementSettingSchema);
