import { asyncHandler } from '../middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../utils/response.js';
import Delivery from '../models/Delivery.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get All Delivery Partners Earnings
 * GET /api/admin/delivery-partners/earnings
 * Query params: deliveryPartnerId, period (today, week, month, all), page, limit, search, fromDate, toDate
 */
export const getDeliveryEarnings = asyncHandler(async (req, res) => {
  try {
    const {
      deliveryPartnerId,
      period = 'all',
      page = 1,
      limit = 50,
      search,
      fromDate,
      toDate
    } = req.query;

    const deliveryQuery = {};
    if (deliveryPartnerId) {
      deliveryQuery._id = deliveryPartnerId;
    }
    if (search) {
      deliveryQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { deliveryId: { $regex: search, $options: 'i' } }
      ];
    }

    const deliveries = await Delivery.find(deliveryQuery)
      .select('_id name phone email deliveryId status')
      .lean();

    const deliveryIds = deliveries.map(d => d._id);

    if (deliveryIds.length === 0) {
      return successResponse(res, 200, 'No delivery partners found', {
        earnings: [],
        summary: {
          totalDeliveryPartners: 0,
          totalEarnings: 0,
          totalOrders: 0
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    let startDate = null;
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (fromDate || toDate) {
      if (fromDate) {
        startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
      }
      if (toDate) {
        endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      const now = new Date();
      switch (period) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          startDate = new Date(now);
          const day = startDate.getDay();
          const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
          startDate.setDate(diff);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = null;
      }
    }

    const wallets = await DeliveryWallet.find({
      deliveryId: { $in: deliveryIds }
    }).lean();

    let allEarnings = [];

    for (const wallet of wallets) {
      const delivery = deliveries.find(d => {
        const deliveryId = d._id.toString();
        const walletDeliveryId = wallet.deliveryId?.toString();
        return deliveryId === walletDeliveryId;
      });

      if (!delivery) continue;

      let transactions = wallet.transactions || [];
      transactions = transactions.filter(t =>
        t.type === 'payment' &&
        t.status === 'Completed'
      );

      if (startDate) {
        transactions = transactions.filter(t => {
          const transactionDate = t.createdAt || t.processedAt || new Date();
          return transactionDate >= startDate && transactionDate <= endDate;
        });
      }

      if (transactions.length === 0) continue;

      const orderIds = transactions
        .filter(t => t.orderId)
        .map(t => {
          if (mongoose.Types.ObjectId.isValid(t.orderId)) {
            return typeof t.orderId === 'string' ? new mongoose.Types.ObjectId(t.orderId) : t.orderId;
          }
          return null;
        })
        .filter(Boolean);

      let orders = [];
      if (orderIds.length > 0) {
        try {
          orders = await Order.find({ _id: { $in: orderIds } })
            .select('orderId status createdAt deliveredAt pricing.total pricing.deliveryFee pricing.tip restaurantName address')
            .lean();
        } catch (orderError) {
          console.error('Error fetching orders:', orderError);
        }
      }

      for (const transaction of transactions) {
        const order = orders.find(o => {
          const orderMongoId = o._id.toString();
          const transactionOrderId = transaction.orderId?.toString();
          return orderMongoId === transactionOrderId;
        });

        const transactionDate = transaction.createdAt || transaction.processedAt || new Date();

        allEarnings.push({
          deliveryPartnerId: delivery._id.toString(),
          deliveryPartnerName: delivery.name || 'Unknown',
          deliveryPartnerPhone: delivery.phone || 'N/A',
          deliveryPartnerEmail: delivery.email || 'N/A',
          deliveryId: delivery.deliveryId || 'N/A',
          transactionId: transaction._id?.toString() || transaction.id || 'N/A',
          orderId: order?.orderId || 'N/A',
          orderMongoId: transaction.orderId?.toString() || null,
          amount: transaction.amount || 0,
          tipAmount: order?.pricing?.tip || 0,
          status: transaction.status || 'Completed',
          createdAt: transactionDate,
          deliveredAt: order?.deliveredAt || null,
          orderStatus: order?.status || 'unknown',
          restaurantName: order?.restaurantName || 'N/A',
          orderTotal: order?.pricing?.total || 0,
          deliveryFee: order?.pricing?.deliveryFee || 0,
          customerAddress: order?.address?.formattedAddress || 'N/A'
        });
      }
    }

    allEarnings.sort((a, b) => {
      const dateA = a.createdAt || new Date(0);
      const dateB = b.createdAt || new Date(0);
      return dateB - dateA;
    });

    const totalEarnings = allEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalTips = allEarnings.reduce((sum, e) => sum + (e.tipAmount || 0), 0);
    const totalOrders = allEarnings.length;
    const uniqueDeliveryPartners = new Set(allEarnings.map(e => e.deliveryPartnerId?.toString()).filter(Boolean)).size;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedEarnings = allEarnings.slice(skip, skip + parseInt(limit));

    return successResponse(res, 200, 'Delivery earnings retrieved successfully', {
      earnings: paginatedEarnings,
      summary: {
        period,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        totalDeliveryPartners: uniqueDeliveryPartners,
        totalEarnings,
        totalTips,
        totalOrders
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allEarnings.length,
        pages: Math.ceil(allEarnings.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery earnings: ${error.message}`, { stack: error.stack });
    return errorResponse(res, 500, 'Failed to fetch delivery earnings');
  }
});
