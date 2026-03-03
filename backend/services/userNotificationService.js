import Order from '../models/Order.js';

let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

export async function notifyUserOrderUpdate(orderId, status) {
  try {
    const io = await getIOInstance();
    if (!io) return;

    const order = await Order.findById(orderId).select('_id orderId').lean();
    if (!order) return;

    const payload = {
      orderId: order.orderId,
      status,
      updatedAt: new Date()
    };

    // Emit on both rooms to support old/new client routing
    io.to(`order:${order._id.toString()}`).emit('order_status_update', payload);
    io.to(`order:${order.orderId}`).emit('order_status_update', payload);
  } catch (error) {
    console.error('Error notifying user about order update:', error);
  }
}
