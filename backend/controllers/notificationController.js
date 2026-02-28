import RestaurantNotification from '../models/RestaurantNotification.js';
import { successResponse, errorResponse } from '../utils/response.js';

/**
 * Get all notifications for the authenticated restaurant
 */
export const getNotifications = async (req, res) => {
    try {
        const restaurantId = req.restaurant._id;

        const notifications = await RestaurantNotification.find({ restaurant: restaurantId })
            .sort({ createdAt: -1 })
            .limit(50);

        return successResponse(res, 200, 'Notifications fetched successfully', {
            notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return errorResponse(res, 500, 'Failed to fetch notifications');
    }
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.restaurant._id;

        const notification = await RestaurantNotification.findOneAndUpdate(
            { _id: id, restaurant: restaurantId },
            { $set: { isRead: true } },
            { new: true }
        );

        if (!notification) {
            return errorResponse(res, 404, 'Notification not found');
        }

        return successResponse(res, 200, 'Notification marked as read', {
            notification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return errorResponse(res, 500, 'Failed to mark notification as read');
    }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req, res) => {
    try {
        const restaurantId = req.restaurant._id;

        await RestaurantNotification.updateMany(
            { restaurant: restaurantId, isRead: false },
            { $set: { isRead: true } }
        );

        return successResponse(res, 200, 'All notifications marked as read');
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return errorResponse(res, 500, 'Failed to mark notifications as read');
    }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.restaurant._id;

        const notification = await RestaurantNotification.findOneAndDelete({
            _id: id,
            restaurant: restaurantId
        });

        if (!notification) {
            return errorResponse(res, 404, 'Notification not found');
        }

        return successResponse(res, 200, 'Notification deleted successfully');
    } catch (error) {
        console.error('Error deleting notification:', error);
        return errorResponse(res, 500, 'Failed to delete notification');
    }
};
