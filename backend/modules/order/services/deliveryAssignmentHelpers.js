import { calculateDistance } from './deliveryAssignmentService.js';

// Helper function to process fallback partners
function processFallbackPartners(deliveryPartners, restaurantLat, restaurantLng, priorityDistance, limit, zone) {
    const deliveryPartnersWithDistance = deliveryPartners
        .map(partner => {
            if (!partner.availability?.currentLocation?.coordinates ||
                partner.availability.currentLocation.coordinates.length < 2) {
                console.warn(`⚠️ Partner ${partner._id} has invalid location`);
                return null;
            }

            const [partnerLng, partnerLat] = partner.availability.currentLocation.coordinates;

            if (partnerLat === 0 && partnerLng === 0) {
                return null;
            }

            const distance = calculateDistance(restaurantLat, restaurantLng, partnerLat, partnerLng);

            if (zone && partner.zoneId && partner.zoneId.toString() === zone._id.toString()) {
                return {
                    ...partner,
                    distance,
                    inZone: true
                };
            }

            return {
                ...partner,
                distance,
                inZone: false
            };
        })
        .filter(partner => partner !== null && partner.distance <= priorityDistance)
        // Sort by distance (nearest first)
        .sort((a, b) => a.distance - b.distance);

    let results = deliveryPartnersWithDistance;

    // Apply limit if provided
    if (limit && typeof limit === 'number' && limit > 0) {
        results = results.slice(0, limit);
    }

    console.log(`✅ Found ${results.length} priority delivery partners within ${priorityDistance}km (FALLBACK - no cash limit applied)`);
    return results.map(partner => ({
        deliveryPartnerId: partner._id.toString(),
        name: partner.name,
        phone: partner.phone,
        distance: partner.distance,
        location: {
            lat: partner.availability.currentLocation.coordinates[1],
            lng: partner.availability.currentLocation.coordinates[0]
        },
        lastLocationUpdate: partner.availability.lastLocationUpdate,
        inZone: partner.inZone || false,
        zoneName: zone?.name || null
    }));
}

// Helper function to process single fallback partner
function processSingleFallbackPartner(deliveryPartners, restaurantLat, restaurantLng, maxDistance, zone) {
    // Calculate distances for all partners
    const partnersWithDistance = deliveryPartners
        .map(partner => {
            if (!partner.availability?.currentLocation?.coordinates ||
                partner.availability.currentLocation.coordinates.length < 2) {
                return null;
            }

            const [partnerLng, partnerLat] = partner.availability.currentLocation.coordinates;

            if (partnerLat === 0 && partnerLng === 0) {
                return null;
            }

            const distance = calculateDistance(restaurantLat, restaurantLng, partnerLat, partnerLng);

            // Check if within max distance
            if (distance > maxDistance) {
                return null;
            }

            return {
                ...partner,
                distance,
                inZone: zone && partner.zoneId && partner.zoneId.toString() === zone._id.toString()
            };
        })
        .filter(partner => partner !== null)
        .sort((a, b) => {
            // Prioritize zone match, then distance
            if (a.inZone && !b.inZone) return -1;
            if (!a.inZone && b.inZone) return 1;
            return a.distance - b.distance;
        });

    if (partnersWithDistance.length === 0) {
        return null;
    }

    const nearest = partnersWithDistance[0];
    console.log(`\u2705 Found nearest delivery partner (FALLBACK - no cash limit): ${nearest.name} at ${nearest.distance.toFixed(2)}km`);

    return {
        deliveryPartnerId: nearest._id.toString(),
        name: nearest.name,
        phone: nearest.phone,
        distance: nearest.distance,
        location: {
            lat: nearest.availability.currentLocation.coordinates[1],
            lng: nearest.availability.currentLocation.coordinates[0]
        },
        lastLocationUpdate: nearest.availability.lastLocationUpdate,
        inZone: nearest.inZone || false,
        zoneName: zone?.name || null
    };
}

export { processFallbackPartners, processSingleFallbackPartner };
