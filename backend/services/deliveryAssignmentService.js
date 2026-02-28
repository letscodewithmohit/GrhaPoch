import Delivery from '../models/Delivery.js';
import Order from '../models/Order.js';
import Zone from '../models/Zone.js';
import Restaurant from '../models/Restaurant.js';
import mongoose from 'mongoose';
import { processFallbackPartners, processSingleFallbackPartner } from './deliveryAssignmentHelpers.js';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Find all nearest available delivery boys within priority distance (for priority notification)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} priorityDistance - Priority distance in km (default: 5km)
 * @returns {Promise<Array>} Array of delivery boys within priority distance
 */
export async function findNearestDeliveryBoys(restaurantLat, restaurantLng, restaurantId = null, priorityDistance = 5, limit = null, isCod = false) {
  try {
    console.log(`🔍 Searching for priority delivery partners within ${priorityDistance}km of restaurant: ${restaurantLat}, ${restaurantLng} (COD: ${isCod})`);

    // Use the same logic as findNearestDeliveryBoy but return all within priority distance
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: { $ne: false }, // include partners where isActive is true OR undefined/null
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0]
      }
    };

    // Filter by cash limit if order is COD
    let cashLimitApplied = false;
    let eligibleIdsForCod = [];
    if (isCod) {
      try {
        const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
        const DeliveryWallet = (await import('../../delivery/models/DeliveryWallet.js')).default;

        const settings = await BusinessSettings.getSettings();
        const cashLimit = settings.deliveryCashLimit || 750;

        // Find wallets where cashInHand is below limit
        const walletsUnderLimit = await DeliveryWallet.find({
          cashInHand: { $lt: cashLimit }
        }).select('deliveryId cashInHand').lean();

        eligibleIdsForCod = walletsUnderLimit.map(w => w.deliveryId);

        console.log(`💰 COD order: Found ${eligibleIdsForCod.length} partners under cash limit of ₹${cashLimit}`);
        console.log(`💰 Wallet details:`, walletsUnderLimit.map(w => ({ id: w.deliveryId.toString().slice(-6), cash: w.cashInHand })));

        if (eligibleIdsForCod.length > 0) {
          // Add to query
          deliveryQuery._id = { $in: eligibleIdsForCod };
          cashLimitApplied = true;
        } else {
          console.warn(`⚠️ No delivery partners under cash limit. Will search without cash limit restriction.`);
        }
      } catch (limitError) {
        console.error('Error filtering by cash limit in findNearestDeliveryBoys:', limitError);
      }
    }

    if (restaurantId) {
      try {
        const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
        zone = await Zone.findOne({
          restaurantId: restaurantIdObj,
          isActive: true
        }).lean();

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone:`, zoneError.message);
      }
    }

    console.log(`🔍 Delivery query:`, JSON.stringify(deliveryQuery, null, 2));

    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners matching query`);

    // Calculate distance and filter
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering
        if (zone) {
          if (partner.zoneId && partner.zoneId.toString() !== zone._id.toString()) {
            return null;
          }
          if (!partner.zoneId && zone.coordinates && zone.coordinates.length >= 3) {
            const zoneCoords = zone.coordinates;
            let inside = false;
            for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
              const xi = zoneCoords[i].longitude;
              const yi = zoneCoords[i].latitude;
              const xj = zoneCoords[j].longitude;
              const yj = zoneCoords[j].latitude;
              const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (!inside) return null;
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= priorityDistance);

    // If no partners found (or all filtered out by zone/distance) AND we were applying cash limit
    if (deliveryPartnersWithDistance.length === 0 && isCod && cashLimitApplied) {
      console.warn(`⚠️ No priority partners found within criteria with cash limit. Retrying without cash limit restriction...`);
      delete deliveryQuery._id;
      const fallbackPartners = await Delivery.find(deliveryQuery)
        .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
        .lean();

      console.log(`📊 Fallback priority search found ${fallbackPartners?.length || 0} partners total`);
      if (fallbackPartners && fallbackPartners.length > 0) {
        return processFallbackPartners(fallbackPartners, restaurantLat, restaurantLng, priorityDistance, limit, zone);
      }
    }

    if (!deliveryPartners || deliveryPartners.length === 0) {
      // Debug: Check if ANY delivery partners exist
      const totalPartners = await Delivery.countDocuments({});
      const onlinePartners = await Delivery.countDocuments({ 'availability.isOnline': true });
      const approvedPartners = await Delivery.countDocuments({ status: { $in: ['approved', 'active'] } });
      console.warn(`⚠️ No delivery partners found at all. Debug info:`);
      console.warn(`   Total partners in DB: ${totalPartners}`);
      console.warn(`   Online partners: ${onlinePartners}`);
      console.warn(`   Approved partners: ${approvedPartners}`);
      return [];
    }
    // Sort by distance (nearest first)
    let results = deliveryPartnersWithDistance.sort((a, b) => a.distance - b.distance);

    // Apply limit if provided
    if (limit && typeof limit === 'number' && limit > 0) {
      results = results.slice(0, limit);
    }

    console.log(`✅ Found ${results.length} priority delivery partners within ${priorityDistance}km`);
    return results.map(partner => ({
      deliveryPartnerId: partner._id.toString(),
      name: partner.name,
      phone: partner.phone,
      distance: partner.distance,
      location: {
        latitude: partner.latitude,
        longitude: partner.longitude
      }
    }));
  } catch (error) {
    console.error('❌ Error finding nearest delivery boys:', error);
    return [];
  }
}

/**
 * Find the nearest available delivery boy to a restaurant location (with zone-based filtering)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} maxDistance - Maximum distance in km (default: 50km)
 * @param {Array} excludeIds - Array of delivery partner IDs to exclude (already notified)
 * @returns {Promise<Object|null>} Nearest delivery boy or null
 */
export async function findNearestDeliveryBoy(restaurantLat, restaurantLng, restaurantId = null, maxDistance = 50, excludeIds = [], isCod = false) {
  try {
    console.log(`🔍 Searching for nearest delivery partner near restaurant: ${restaurantLat}, ${restaurantLng} (Restaurant ID: ${restaurantId}, COD: ${isCod})`);

    // Step 1: Find zone for restaurant (if restaurantId provided)
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: { $ne: false }, // include partners where isActive is true OR undefined/null
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0] // Exclude default/null coordinates
      }
    };

    // Filter by cash limit if order is COD
    let cashLimitApplied = false;
    if (isCod) {
      try {
        const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
        const DeliveryWallet = (await import('../../delivery/models/DeliveryWallet.js')).default;

        const settings = await BusinessSettings.getSettings();
        const cashLimit = settings.deliveryCashLimit || 750;

        // Find wallets where cashInHand is below limit
        const walletsUnderLimit = await DeliveryWallet.find({
          cashInHand: { $lt: cashLimit }
        }).select('deliveryId cashInHand').lean();

        const eligibleIds = walletsUnderLimit.map(w => w.deliveryId);

        console.log(`💰 COD order: Found ${eligibleIds.length} partners under cash limit of ₹${cashLimit}`);

        if (eligibleIds.length > 0) {
          // Add to query (intersection with potentially existing _id query from excludeIds)
          if (deliveryQuery._id) {
            // If _id already exists (e.g., from excludeIds), combine them
            const existingIds = deliveryQuery._id.$nin || [];
            deliveryQuery._id = { $nin: existingIds, $in: eligibleIds };
          } else {
            deliveryQuery._id = { $in: eligibleIds };
          }
          cashLimitApplied = true;
        } else {
          console.warn(`⚠️ No delivery partners under cash limit. Will search without cash limit restriction.`);
        }
      } catch (limitError) {
        console.error('Error filtering by cash limit in findNearestDeliveryBoy:', limitError);
      }
    }

    if (restaurantId) {
      try {
        // Try to find zone by restaurantId
        const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
        zone = await Zone.findOne({
          restaurantId: restaurantIdObj,
          isActive: true
        }).lean();

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);

          // Option A: Filter by zoneId if Delivery model has zoneId field
          // Uncomment when zoneId is added to Delivery model
          // deliveryQuery.zoneId = zone._id;

          // Option B: Filter by geo-spatial query (if zone has boundary)
          // This is more complex and slower, but works without modifying Delivery model
          if (zone.boundary && zone.boundary.coordinates) {
            // For now, we'll use distance-based with zone coordinate check
            // In production, you can use $geoWithin for better accuracy
            console.log(`📍 Zone boundary found, will filter by location after distance calculation`);
          }
        } else {
          console.log(`⚠️ No zone found for restaurant ${restaurantId}, using distance-based assignment`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone for restaurant ${restaurantId}:`, zoneError.message);
        // Continue with distance-based assignment
      }
    }

    // Exclude already notified delivery partners
    if (excludeIds && excludeIds.length > 0) {
      const excludeObjectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeObjectIds.length > 0) {
        deliveryQuery._id = { $nin: excludeObjectIds };
        console.log(`🚫 Excluding ${excludeObjectIds.length} already notified delivery partners`);
      }
    }

    // Find all online delivery partners matching criteria
    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners matching initial query`);

    // Calculate distance and filter by zone/distance
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering
        if (zone) {
          if (partner.zoneId && partner.zoneId.toString() !== zone._id.toString()) {
            return null;
          }

          if (!partner.zoneId && zone.coordinates && zone.coordinates.length >= 3) {
            const zoneCoords = zone.coordinates;
            let inside = false;
            for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
              const xi = zoneCoords[i].longitude;
              const yi = zoneCoords[i].latitude;
              const xj = zoneCoords[j].longitude;
              const yj = zoneCoords[j].latitude;
              const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (!inside) return null;
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= maxDistance);

    // If no suitable partners found and we were restricted by cash limit
    if (deliveryPartnersWithDistance.length === 0 && isCod && cashLimitApplied) {
      console.warn(`⚠️ No suitable delivery partners found with current criteria/cash limit. Retrying without cash limit...`);
      // Remove the cash limit filter
      if (deliveryQuery._id && deliveryQuery._id.$in) {
        delete deliveryQuery._id;
        // Re-add exclude IDs if they exist
        if (excludeIds && excludeIds.length > 0) {
          const excludeObjectIds = excludeIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
          if (excludeObjectIds.length > 0) {
            deliveryQuery._id = { $nin: excludeObjectIds };
          }
        }
      }
      const fallbackPartners = await Delivery.find(deliveryQuery)
        .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
        .lean();

      console.log(`📊 Fallback single search found ${fallbackPartners?.length || 0} partners total`);
      if (fallbackPartners && fallbackPartners.length > 0) {
        return processSingleFallbackPartner(fallbackPartners, restaurantLat, restaurantLng, maxDistance, zone);
      }
    }

    if (deliveryPartnersWithDistance.length === 0) {
      console.log(`⚠️ No online delivery partners found matching criteria within ${maxDistance}km`);
      return null;
    }

    // Sort by distance (nearest first)
    const sortedPartners = deliveryPartnersWithDistance.sort((a, b) => a.distance - b.distance);
    const nearestPartner = sortedPartners[0];

    console.log(`✅ Found nearest delivery partner: ${nearestPartner.name} (ID: ${nearestPartner._id})`);
    console.log(`✅ Distance: ${nearestPartner.distance.toFixed(2)}km away`);
    console.log(`✅ Phone: ${nearestPartner.phone}`);

    return {
      deliveryPartnerId: nearestPartner._id.toString(),
      name: nearestPartner.name,
      phone: nearestPartner.phone,
      distance: nearestPartner.distance,
      location: {
        latitude: nearestPartner.latitude,
        longitude: nearestPartner.longitude
      }
    };
  } catch (error) {
    console.error('❌ Error finding nearest delivery boy:', error);
    throw error;
  }
}

/**
 * Assign order to nearest delivery boy
 * @param {Object} order - Order document
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Assignment result or null
 */
export async function assignOrderToDeliveryBoy(order, restaurantLat, restaurantLng, restaurantId = null) {
  try {
    // CRITICAL: Don't assign if order is cancelled
    if (order.status === 'cancelled') {
      console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot assign to delivery partner.`);
      return null;
    }

    // CRITICAL: Don't assign if order is already delivered/completed
    if (order.status === 'delivered' ||
      order.deliveryState?.currentPhase === 'completed' ||
      order.deliveryState?.status === 'delivered') {
      console.log(`⚠️ Order ${order.orderId} is already delivered/completed. Cannot assign.`);
      return null;
    }

    // Check if order already has a delivery partner assigned
    if (order.deliveryPartnerId) {
      console.log(`⚠️ Order ${order.orderId} already has delivery partner assigned`);
      return null;
    }

    // Get restaurantId from order if not provided
    const orderRestaurantId = restaurantId || order.restaurantId;

    // Check if order is COD
    const isCod = order.payment?.method === 'cash' || order.payment?.method === 'cod';

    // Find nearest delivery boy (with zone-based filtering and cash limit)
    const nearestDeliveryBoy = await findNearestDeliveryBoy(restaurantLat, restaurantLng, orderRestaurantId, 50, [], isCod);

    if (!nearestDeliveryBoy) {
      console.log(`⚠️ No delivery boy found for order ${order.orderId}`);
      return null;
    }

    // Update order with delivery partner assignment
    // Note: Don't set outForDelivery yet - that should happen when delivery boy picks up the order
    order.deliveryPartnerId = nearestDeliveryBoy.deliveryPartnerId;

    // IMPORTANT: assignmentInfo.distance represents restaurant -> customer distance
    // and is used for delivery fee/earnings. Do not overwrite it with rider -> restaurant distance.
    const existingAssignmentInfo = order.assignmentInfo || {};
    const canonicalOrderDistance =
      (typeof existingAssignmentInfo.distance === 'number' && Number.isFinite(existingAssignmentInfo.distance))
        ? existingAssignmentInfo.distance
        : null;

    order.assignmentInfo = {
      ...existingAssignmentInfo,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      distance: canonicalOrderDistance ?? nearestDeliveryBoy.distance,
      assignedAt: new Date(),
      assignedBy: 'nearest_available'
    };
    // Don't set outForDelivery status here - that should be set when delivery boy picks up the order
    // order.tracking.outForDelivery = {
    //   status: true,
    //   timestamp: new Date()
    // };

    await order.save();

    // Trigger ETA recalculation for rider assigned event
    try {
      const etaEventService = (await import('./etaEventService.js')).default;
      await etaEventService.handleRiderAssigned(order._id.toString(), nearestDeliveryBoy.deliveryPartnerId);
      console.log(`✅ ETA updated after rider assigned to order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after rider assignment:', etaError);
      // Continue even if ETA update fails
    }

    console.log(`✅ Assigned order ${order.orderId} to delivery partner ${nearestDeliveryBoy.name}`);

    return {
      success: true,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      deliveryPartnerName: nearestDeliveryBoy.name,
      distance: nearestDeliveryBoy.distance,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('❌ Error assigning order to delivery boy:', error);
    throw error;
  }
}

