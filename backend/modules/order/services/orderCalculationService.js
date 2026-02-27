import Restaurant from '../../restaurant/models/Restaurant.js';
import Offer from '../../restaurant/models/Offer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import DeliveryBoyCommission from '../../admin/models/DeliveryBoyCommission.js';
import mongoose from 'mongoose';
import { calculateRoute } from './routeCalculationService.js';

/**
 * Get active fee settings from database
 * Returns default values if no settings found
 */
const getFeeSettings = async () => {
  try {
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    if (feeSettings) {
      return feeSettings;
    }

    // Return default values if no active settings found
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      gstRate: 5,
      fixedFee: 0,
    };
  } catch (error) {
    console.error('Error fetching fee settings:', error);
    // Return default values on error
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      gstRate: 5,
      fixedFee: 0,
    };
  }
};

/**
 * Normalize coordinate input to [longitude, latitude] array
 * Handles:
 * 1. [lng, lat] array
 * 2. { latitude, longitude } object
 * 3. { lat, lng } object
 * 4. { coordinates: [lng, lat] } GeoJSON object
 * 5. { location: { coordinates: [lng, lat] } } Nested GeoJSON
 * 6. { location: { latitude, longitude } } Nested flat object
 */
export const normalizeCoordinates = (input) => {
  if (!input) return null;

  // 1. If it's already an array [lng, lat]
  if (Array.isArray(input) && input.length >= 2) {
    return [Number(input[0]), Number(input[1])];
  }

  // 2. If it's a nested location object (like from address or restaurant model)
  if (input.location) {
    return normalizeCoordinates(input.location);
  }

  // 3. If it's a GeoJSON object { coordinates: [lng, lat] }
  if (input.coordinates && Array.isArray(input.coordinates)) {
    return [Number(input.coordinates[0]), Number(input.coordinates[1])];
  }

  // 4. If it's a flat object with latitude/longitude
  const lat = input.latitude ?? input.lat;
  const lng = input.longitude ?? input.lng;

  if (lat !== undefined && lng !== undefined) {
    return [Number(lng), Number(lat)];
  }

  return null;
};

/**
 * Calculate distance between two points (Haversine formula)
 * @param {Array|Object} point1 - First coordinate point
 * @param {Array|Object} point2 - Second coordinate point
 * @returns {number|null} - Distance in kilometers
 */
export const calculateDistance = (point1, point2) => {
  const coord1 = normalizeCoordinates(point1);
  const coord2 = normalizeCoordinates(point2);

  if (!coord1 || !coord2) return null;

  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  // If any coordinates are [0,0], return 0 to avoid massive incorrect distances
  if ((lng1 === 0 && lat1 === 0) || (lng2 === 0 && lat2 === 0)) {
    return 0;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

/**
 * Calculate delivery distance using road-route distance (OSRM) with Haversine fallback.
 * This keeps user cart distance and settlement distance aligned.
 */
export const calculateDeliveryDistance = async (restaurant, deliveryAddress = null) => {
  const restaurantCoord = normalizeCoordinates(restaurant);
  const customerCoord = normalizeCoordinates(deliveryAddress);

  if (!restaurantCoord || !customerCoord) return null;

  const [restaurantLng, restaurantLat] = restaurantCoord;
  const [customerLng, customerLat] = customerCoord;

  // Guard invalid map points
  if ((restaurantLng === 0 && restaurantLat === 0) || (customerLng === 0 && customerLat === 0)) {
    return 0;
  }

  try {
    const route = await calculateRoute(restaurantLat, restaurantLng, customerLat, customerLng);
    if (route && typeof route.distance === 'number' && !Number.isNaN(route.distance)) {
      return route.distance;
    }
  } catch (error) {
    console.warn(`Road distance calculation failed, falling back to Haversine: ${error.message}`);
  }

  return calculateDistance(restaurant, deliveryAddress);
};

/**
 * Calculate delivery fee based on order value, distance, and restaurant settings
 */
export const calculateDeliveryFee = async (orderValue, restaurant, deliveryAddress = null, distanceInKm = null) => {
  // Get fee settings from database
  const feeSettings = await getFeeSettings();

  // 1. Free delivery threshold check DISABLED


  // 2. Dynamic distance-based calculation
  const distance = distanceInKm ?? calculateDistance(restaurant, deliveryAddress);

  if (distance !== null) {
    try {
      const commissionResult = await DeliveryBoyCommission.calculateCommission(distance);
      if (commissionResult && commissionResult.commission > 0) {
        if (process.env.DEBUG_PRICING_LOGS === 'true') {
          console.log(`[Pricing] Dynamic Delivery Fee Applied: ₹${commissionResult.commission} for ${distance.toFixed(2)}km`);
        }
        return commissionResult.commission;
      }
    } catch (error) {
      console.error('Error calculating dynamic delivery fee:', error);
    }
  }

  // 3. Restaurant free delivery DISABLED


  // 4. Fallback to order-value based ranges if distance calculation failed
  if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
    const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min);

    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i];
      const isLastRange = i === sortedRanges.length - 1;

      if (isLastRange) {
        if (orderValue >= range.min && orderValue <= range.max) {
          return range.fee;
        }
      } else {
        if (orderValue >= range.min && orderValue < range.max) {
          return range.fee;
        }
      }
    }
  }

  // 5. Ultimate fallback
  return feeSettings.deliveryFee || 25;
};

/**
 * Calculate platform fee based on distance
 * @param {number} distanceInKm - Distance between user and restaurant in kilometers
 * @returns {Promise<number>} - Platform fee amount
 */
export const calculatePlatformFee = async (distanceInKm = null) => {
  const feeSettings = await getFeeSettings();

  // If distance is provided and platform fee ranges are configured, use range-based calculation
  if (distanceInKm !== null && distanceInKm !== undefined &&
    feeSettings.platformFeeRanges &&
    Array.isArray(feeSettings.platformFeeRanges) &&
    feeSettings.platformFeeRanges.length > 0) {

    // Sort ranges by min value to ensure proper checking
    const sortedRanges = [...feeSettings.platformFeeRanges].sort((a, b) => a.min - b.min);

    // Find matching range (distance >= min && distance < max)
    // For the last range, we check distance >= min && distance <= max
    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i];
      const isLastRange = i === sortedRanges.length - 1;

      if (isLastRange) {
        // Last range: include max value
        if (distanceInKm >= range.min && distanceInKm <= range.max) {
          return range.fee;
        }
      } else {
        // Other ranges: exclude max value (handled by next range)
        if (distanceInKm >= range.min && distanceInKm < range.max) {
          return range.fee;
        }
      }
    }
  }

  // Fallback to default platform fee if no range matches or distance not provided
  return feeSettings.platformFee || 5;
};

/**
 * Calculate GST (Goods and Services Tax)
 * GST is calculated on subtotal after discounts
 * NOTE: Currently set to 0 as per client request
 */
export const calculateGST = async (subtotal, discount = 0) => {
  return 0; // GST for now Zero
};

/**
 * Calculate discount based on coupon code
 */
export const calculateDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;

  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return 0; // Minimum order not met
  }

  if (coupon.type === 'percentage') {
    const maxDiscount = coupon.maxDiscount || Infinity;
    const discount = Math.min(
      Math.round(subtotal * (coupon.discount / 100)),
      maxDiscount
    );
    return discount;
  } else if (coupon.type === 'flat') {
    return Math.min(coupon.discount, subtotal); // Can't discount more than subtotal
  }

  // Default: flat discount
  return Math.min(coupon.discount || 0, subtotal);
};


/**
 * Main function to calculate order pricing
 */
export const calculateOrderPricing = async ({
  items,
  restaurantId,
  deliveryAddress = null,
  couponCode = null,
  deliveryFleet = 'standard',
  tip = 0,
  donation = 0
}) => {
  try {
    // Get fee settings
    const feeSettings = await getFeeSettings();
    const fixedFee = feeSettings.fixedFee || 0;

    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);

    if (subtotal <= 0) {
      throw new Error('Order subtotal must be greater than 0');
    }

    // Get restaurant details
    let restaurant = null;
    if (restaurantId) {
      if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
        restaurant = await Restaurant.findById(restaurantId).lean();
      }
      if (!restaurant) {
        restaurant = await Restaurant.findOne({
          $or: [
            { restaurantId: restaurantId },
            { slug: restaurantId }
          ]
        }).lean();
      }
    }

    // Calculate coupon discount
    let discount = 0;
    let appliedCoupon = null;

    if (couponCode && restaurant) {
      try {
        // Get restaurant ObjectId
        let restaurantObjectId = restaurant._id;
        if (!restaurantObjectId && mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
          restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);
        }

        if (restaurantObjectId) {
          const now = new Date();

          // Find active offer with this coupon code for this restaurant
          const offer = await Offer.findOne({
            restaurant: restaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now },
            $or: [
              { endDate: { $gte: now } },
              { endDate: null }
            ]
          }).lean();

          if (offer) {
            // Find the specific item coupon
            const couponItem = offer.items.find(item => item.couponCode === couponCode);

            if (couponItem) {
              // Check if coupon is valid for items in cart
              const cartItemIds = items.map(item => item.itemId);
              const isValidForCart = couponItem.itemId && cartItemIds.includes(couponItem.itemId);

              // Check minimum order value
              const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;

              if (isValidForCart && minOrderMet) {
                // Calculate discount based on offer type
                const itemInCart = items.find(item => item.itemId === couponItem.itemId);
                if (itemInCart) {
                  const itemQuantity = itemInCart.quantity || 1;

                  // Calculate discount per item
                  const discountPerItem = couponItem.originalPrice - couponItem.discountedPrice;

                  // Apply discount to all quantities of this item
                  discount = Math.round(discountPerItem * itemQuantity);

                  // Ensure discount doesn't exceed item subtotal
                  const itemSubtotal = (itemInCart.price || 0) * itemQuantity;
                  discount = Math.min(discount, itemSubtotal);
                }

                appliedCoupon = {
                  code: couponCode,
                  discount: discount,
                  discountPercentage: couponItem.discountPercentage,
                  minOrder: offer.minOrderValue || 0,
                  type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                  itemId: couponItem.itemId,
                  itemName: couponItem.itemName,
                  originalPrice: couponItem.originalPrice,
                  discountedPrice: couponItem.discountedPrice,
                };
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching coupon from database: ${error.message}`);
        // Continue without coupon if there's an error
      }
    }

    // Calculate distance once and reuse it for all pricing components
    const distanceInKm = await calculateDeliveryDistance(restaurant, deliveryAddress);

    // Calculate delivery fee
    const deliveryFee = await calculateDeliveryFee(
      subtotal,
      restaurant,
      deliveryAddress,
      distanceInKm
    );

    // Apply free delivery from coupon
    const finalDeliveryFee = appliedCoupon?.freeDelivery ? 0 : deliveryFee;

    // Calculate platform fee based on distance
    const platformFee = await calculatePlatformFee(distanceInKm);

    // Calculate GST on subtotal after discount
    const gst = await calculateGST(subtotal, discount);

    // Calculate total
    const total = subtotal - discount + finalDeliveryFee + platformFee + fixedFee + gst + Number(tip) + Number(donation);

    // Calculate savings (discount + any delivery savings)
    const savings = discount + (deliveryFee > finalDeliveryFee ? deliveryFee - finalDeliveryFee : 0);

    return {
      subtotal: Math.round(subtotal),
      discount: Math.round(discount),
      deliveryFee: Math.round(finalDeliveryFee),
      platformFee: Math.round(platformFee),
      fixedFee: Math.round(fixedFee),
      tax: gst, // Already rounded in calculateGST
      tip: Number(tip),
      donation: Number(donation),
      total: Math.round(total),
      savings: Math.round(savings),
      distance: distanceInKm ? Math.round(distanceInKm * 100) / 100 : null,
      distanceStr: distanceInKm ? `${distanceInKm.toFixed(1)} km` : null,
      appliedCoupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount: discount,
        freeDelivery: appliedCoupon.freeDelivery || false
      } : null,
      breakdown: {
        itemTotal: Math.round(subtotal),
        discountAmount: Math.round(discount),
        deliveryFee: Math.round(finalDeliveryFee),
        platformFee: Math.round(platformFee),
        fixedFee: Math.round(fixedFee),
        gst: gst,
        tip: Number(tip),
        donation: Number(donation),
        total: Math.round(total),
        distance: distanceInKm ? Math.round(distanceInKm * 100) / 100 : null
      }
    };
  } catch (error) {
    throw new Error(`Failed to calculate order pricing: ${error.message}`);
  }
};
