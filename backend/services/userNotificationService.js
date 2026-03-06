import { notifyUserFCM } from './fcmNotificationService.js';
import Order from '../models/Order.js';

let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

/**
 * Get notification text based on status
 */
const getStatusNotification = (status, orderId) => {
  const statusMap = {
    'confirmed': {
      title: '✅ Order Confirmed',
      body: `Your order #${orderId} has been confirmed and is being sent to the kitchen.`
    },
    'preparing': {
      title: '👨‍🍳 Preparing your food',
      body: `The restaurant has started preparing your delicious meal for order #${orderId}.`
    },
    'ready': {
      title: '📦 Order Ready',
      body: `Your order #${orderId} is ready and waiting for a delivery partner.`
    },
    'picked_up': {
      title: '🛵 Food is on the way!',
      body: `Your order #${orderId} has been picked up and is heading your way.`
    },
    'at_delivery': {
      title: '📍 Arrived!',
      body: `The delivery partner has reached your location with order #${orderId}.`
    },
    'delivered': {
      title: '🎉 Enjoy your meal!',
      body: `Your order #${orderId} has been delivered. Don't forget to rate your experience!`
    },
    'cancelled': {
      title: '❌ Order Cancelled',
      body: `Your order #${orderId} has been cancelled.`
    }
  };
  return statusMap[status] || { title: 'Order Update', body: `Your order #${orderId} status is now ${status}.` };
};

export async function notifyUserOrderUpdate(orderId, status) {
  try {
    const order = await Order.findById(orderId).select('_id orderId userId restaurantName').lean();
    if (!order) return;

    const io = await getIOInstance();
    const payload = {
      orderId: order.orderId,
      status,
      updatedAt: new Date()
    };

    // Socket.IO notifications
    if (io) {
      io.to(`order:${order._id.toString()}`).emit('order_status_update', payload);
      io.to(`order:${order.orderId}`).emit('order_status_update', payload);
    }

    // FCM notifications
    const { title, body } = getStatusNotification(status, order.orderId);
    await notifyUserFCM(order.userId, title, body, {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      status
    });

  } catch (error) {
    console.error('Error notifying user about order update:', error);
  }
}
