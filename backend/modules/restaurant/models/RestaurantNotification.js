import mongoose from 'mongoose';

const restaurantNotificationSchema = new mongoose.Schema({
    restaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['subscription_expired', 'subscription_activated', 'general', 'alert'],
        default: 'general'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const RestaurantNotification = mongoose.model('RestaurantNotification', restaurantNotificationSchema);

export default RestaurantNotification;
