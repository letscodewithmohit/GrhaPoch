import Order from '../models/Order.js';
import OrderSettlement from '../models/OrderSettlement.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import DeliveryBoyCommission from '../../admin/models/DeliveryBoyCommission.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';
import { calculateDistance } from './orderCalculationService.js';

/**
 * Calculate comprehensive order settlement breakdown
 * This calculates earnings for User, Restaurant, Delivery Partner, and Admin
 */
export const calculateOrderSettlement = async (orderId) => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    // Get fee settings
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    const platformFee = feeSettings?.platformFee || 5;
    const gstRate = (feeSettings?.gstRate || 5) / 100;

    // Get restaurant details
    let restaurant = null;
    if (mongoose.Types.ObjectId.isValid(order.restaurantId) && order.restaurantId.length === 24) {
      restaurant = await Restaurant.findById(order.restaurantId).lean();
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: order.restaurantId },
          { slug: order.restaurantId }
        ]
      }).lean();
    }

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    // Calculate user payment breakdown
    const userPayment = {
      subtotal: order.pricing.subtotal || 0,
      discount: order.pricing.discount || 0,
      deliveryFee: order.pricing.deliveryFee || 0,
      platformFee: order.pricing.platformFee || platformFee,
      gst: order.pricing.tax || 0,
      fixedFee: order.pricing.fixedFee || 0,
      packagingFee: 0, // Can be added later if needed
      tip: order.pricing.tip || 0,
      donation: order.pricing.donation || 0,
      total: order.pricing.total || 0
    };

    // Calculate restaurant commission and earnings
    // Commission is calculated on food price (subtotal - discount)
    const foodPrice = userPayment.subtotal - userPayment.discount;

    let commissionAmount = 0;
    let commissionPercentage = 0;
    let commissionData = null;

    // Check if order has commission snapshot (New Orders)
    if (order.pricing && order.pricing.commission && order.pricing.commission.amount !== undefined) {
      commissionAmount = order.pricing.commission.amount;
      commissionPercentage = order.pricing.commission.type === 'percentage'
        ? order.pricing.commission.rate
        : 0; // If fixed, percentage is effectively 0 or calc manually

      commissionData = {
        commission: commissionAmount,
        type: order.pricing.commission.type,
        value: order.pricing.commission.rate
      };
    } else {
      // Fallback for old orders
      const restaurantCommissionData = await RestaurantCommission.calculateCommissionForOrder(
        restaurant._id,
        foodPrice,
        order.items
      );
      commissionAmount = Math.round(restaurantCommissionData.commission * 100) / 100;
      commissionPercentage = restaurantCommissionData.type === 'percentage'
        ? restaurantCommissionData.value
        : (commissionAmount / foodPrice) * 100;

      commissionData = restaurantCommissionData;
    }

    const restaurantNetEarning = Math.round((foodPrice - commissionAmount) * 100) / 100;

    const restaurantEarning = {
      foodPrice: foodPrice, // Full order value (₹200)
      commission: commissionAmount, // Commission deducted (₹30 for 15%)
      commissionPercentage: commissionPercentage,
      netEarning: restaurantNetEarning, // Amount restaurant receives (₹170)
      status: 'pending'
    };

    // Calculate delivery partner earnings
    let deliveryPartnerEarning = {
      basePayout: 0,
      distance: 0,
      commissionPerKm: 0,
      distanceCommission: 0,
      surgeMultiplier: 1,
      surgeAmount: 0,
      tip: userPayment.tip,
      totalEarning: userPayment.tip,
      status: 'pending'
    };

    if (order.deliveryPartnerId && order.assignmentInfo?.distance !== undefined && order.assignmentInfo?.distance !== null) {
      const distance = order.assignmentInfo.distance;
      const deliveryCommission = await DeliveryBoyCommission.calculateCommission(distance);

      // NEW LOGIC: Base Payout is the ENTIRE delivery fee paid by the user (which already includes distance commission)
      // Or the total commission according to rules (whichever is higher)
      const commissionFromRule = deliveryCommission.commission || 0;
      const basePayout = Math.max(userPayment.deliveryFee, commissionFromRule);

      // Distance commission is now 0 because it's already included in the basePayout
      const distanceCommission = 0;

      // Get surge multiplier
      const surgeMultiplier = order.assignmentInfo?.surgeMultiplier || 1;
      const surgeAmount = 0;

      // Total Earning = Base Payout (which includes distance) + Surge + Tip
      const deliveryPartnerTotal = basePayout + surgeAmount + userPayment.tip;

      deliveryPartnerEarning = {
        basePayout: basePayout, // This is now userPayment.deliveryFee
        distance: distance,
        commissionPerKm: deliveryCommission.breakdown.commissionPerKm,
        distanceCommission: distanceCommission,
        surgeMultiplier: surgeMultiplier,
        surgeAmount: surgeAmount,
        tip: userPayment.tip,
        totalEarning: Math.round(deliveryPartnerTotal * 100) / 100,
        status: 'pending'
      };
    } else if (userPayment.tip > 0) {
      // Even if no partner assigned yet, track the tip
      deliveryPartnerEarning.tip = userPayment.tip;
      deliveryPartnerEarning.totalEarning = userPayment.tip;
    }

    // Calculate admin/platform earnings
    // Admin gets: Restaurant commission + Platform fee + Delivery fee (collected) + GST + Fixed Fee
    // Less: Payout to delivery partner (excluding tip which passes through)

    // Delivery Margin Calculation:
    // Admin collects: userPayment.deliveryFee
    // Admin pays partner: (userPayment.deliveryFee + distanceCommission + surge)
    // Margin = Collected - Paid = - (distanceCommission + surge)
    // Note: This logic implies Admin subsidizes distance commission and surge.

    const deliveryPartnerBaseEarning = deliveryPartnerEarning.totalEarning - userPayment.tip;
    const deliveryMargin = userPayment.deliveryFee - deliveryPartnerBaseEarning;

    const adminCommission = Math.round(restaurantEarning.commission * 100) / 100;
    const adminPlatformFee = Math.round(userPayment.platformFee * 100) / 100;
    const adminDeliveryFee = Math.round(userPayment.deliveryFee * 100) / 100;
    const adminGST = Math.round(userPayment.gst * 100) / 100;
    const adminFixedFee = Math.round((userPayment.fixedFee || 0) * 100) / 100;
    const adminDonation = Math.round((userPayment.donation || 0) * 100) / 100;
    const adminTotal = Math.round((adminCommission + adminPlatformFee + deliveryMargin + adminGST + adminFixedFee + adminDonation) * 100) / 100;

    const adminEarning = {
      commission: adminCommission,
      platformFee: adminPlatformFee,
      fixedFee: adminFixedFee,
      deliveryFee: adminDeliveryFee,
      gst: adminGST,
      donation: adminDonation,
      deliveryMargin: Math.round(deliveryMargin * 100) / 100, // Allow negative margin
      totalEarning: adminTotal,
      status: 'pending'
    };

    // Create or update settlement
    let settlement = await OrderSettlement.findOne({ orderId });

    const settlementData = {
      orderNumber: order.orderId,
      userId: order.userId,
      restaurantId: restaurant._id,
      restaurantName: restaurant.name || order.restaurantName,
      deliveryPartnerId: order.deliveryPartnerId || null,
      userPayment,
      restaurantEarning,
      deliveryPartnerEarning,
      adminEarning,
      escrowStatus: 'pending',
      escrowAmount: userPayment.total,
      settlementStatus: 'pending',
      calculationSnapshot: {
        feeSettings: {
          platformFee: feeSettings?.platformFee,
          gstRate: feeSettings?.gstRate,
          deliveryFee: feeSettings?.deliveryFee
        },
        restaurantCommission: {
          type: commissionData.type,
          value: commissionData.value,
          rule: commissionData.rule || null
        },
        deliveryCommission: deliveryPartnerEarning.distance > 0 ? {
          distance: deliveryPartnerEarning.distance,
          basePayout: deliveryPartnerEarning.basePayout,
          commissionPerKm: deliveryPartnerEarning.commissionPerKm
        } : null,
        calculatedAt: new Date()
      }
    };

    if (settlement) {
      Object.assign(settlement, settlementData);
      await settlement.save();
    } else {
      settlement = await OrderSettlement.create({
        orderId,
        ...settlementData
      });
    }

    return settlement;
  } catch (error) {
    console.error(`❌ Error in calculateOrderSettlement for order ${orderId}:`, error);
    throw new Error(error.message || 'Failed to calculate order settlement');
  }
};

/**
 * Get settlement details for an order
 */
export const getOrderSettlement = async (orderId) => {
  try {
    let settlement = await OrderSettlement.findOne({ orderId })
      .populate('orderId', 'orderId status')
      .populate('restaurantId', 'name restaurantId')
      .populate('deliveryPartnerId', 'name phone')
      .lean();

    if (!settlement) {
      // Calculate if doesn't exist
      settlement = await calculateOrderSettlement(orderId);
    }

    return settlement;
  } catch (error) {
    console.error('Error getting order settlement:', error);
    throw error;
  }
};

/**
 * Update settlement when order status changes
 */
export const updateSettlementOnStatusChange = async (orderId, newStatus, previousStatus) => {
  try {
    const settlement = await OrderSettlement.findOne({ orderId });
    if (!settlement) {
      return;
    }

    // Update escrow status based on order status
    if (newStatus === 'delivered') {
      settlement.escrowStatus = 'released';
      settlement.escrowReleasedAt = new Date();
      settlement.settlementStatus = 'completed';
    } else if (newStatus === 'cancelled') {
      settlement.escrowStatus = 'refunded';
      settlement.settlementStatus = 'cancelled';
    }

    await settlement.save();
  } catch (error) {
    console.error('Error updating settlement on status change:', error);
    throw error;
  }
};

