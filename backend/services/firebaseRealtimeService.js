import { getFirebaseRealtimeDb } from '../config/firebaseRealtime.js';

const DELIVERY_ROOT = 'delivery_boys';
const ORDER_ROOT = 'active_orders';
const ROUTE_CACHE_ROOT = 'route_cache';
const USERS_ROOT = 'users';
const DRIVERS_ROOT = 'drivers';

const sanitizeKey = (value) => String(value || '').replace(/[.#$/\[\]]/g, '_');

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stripUndefined = (obj) => (
  Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined))
);

const isValidCoordinate = (lat, lng) => (
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180
);

const getDb = () => {
  const db = getFirebaseRealtimeDb();
  if (!db) return null;
  return db;
};

const normalizeRoutePoints = (routePoints = []) => {
  if (!Array.isArray(routePoints)) return [];

  return routePoints
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = toNumberOrNull(point[0]);
        const lng = toNumberOrNull(point[1]);
        if (!isValidCoordinate(lat, lng)) return null;
        return { lat, lng };
      }

      if (point && typeof point === 'object') {
        const lat = toNumberOrNull(point.lat);
        const lng = toNumberOrNull(point.lng);
        if (!isValidCoordinate(lat, lng)) return null;
        return { lat, lng };
      }

      return null;
    })
    .filter(Boolean);
};

const encodeSignedNumber = (num) => {
  let value = num < 0 ? ~(num << 1) : (num << 1);
  let encoded = '';
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);
  return encoded;
};

const encodePolyline = (points = []) => {
  if (!Array.isArray(points) || points.length < 2) return '';

  let result = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    result += encodeSignedNumber(dLat);
    result += encodeSignedNumber(dLng);

    prevLat = lat;
    prevLng = lng;
  }

  return result;
};

const toRouteCacheToken = (value) => {
  const normalized = Number((toNumberOrNull(value) ?? 0).toFixed(4));
  return normalized
    .toString()
    .replace('-', 'm')
    .replace('.', '_');
};

const buildRouteCacheKey = ({ startLat, startLng, endLat, endLng }) => (
  `${toRouteCacheToken(startLat)}_${toRouteCacheToken(startLng)}_${toRouteCacheToken(endLat)}_${toRouteCacheToken(endLng)}`
);

export const upsertRouteCacheRealtime = async ({
  startLat,
  startLng,
  endLat,
  endLng,
  polyline = '',
  routePoints = null,
  distanceKm = null,
  durationMin = null,
  ttlHours = 168
}) => {
  const db = getDb();
  if (!db) return null;

  const sLat = toNumberOrNull(startLat);
  const sLng = toNumberOrNull(startLng);
  const eLat = toNumberOrNull(endLat);
  const eLng = toNumberOrNull(endLng);
  if (!isValidCoordinate(sLat, sLng) || !isValidCoordinate(eLat, eLng)) return null;

  const normalizedPoints = normalizeRoutePoints(routePoints || []);
  const encodedPolyline = (typeof polyline === 'string' && polyline.trim())
    ? polyline.trim()
    : encodePolyline(normalizedPoints);

  if (!encodedPolyline) return null;

  const timestamp = Date.now();
  const ttlMs = Math.max(1, Number(ttlHours) || 168) * 60 * 60 * 1000;
  const key = buildRouteCacheKey({ startLat: sLat, startLng: sLng, endLat: eLat, endLng: eLng });

  const payload = stripUndefined({
    polyline: encodedPolyline,
    cached_at: timestamp,
    expires_at: timestamp + ttlMs
  });

  const distanceValue = toNumberOrNull(distanceKm);
  if (Number.isFinite(distanceValue)) {
    payload.distance = Math.round(distanceValue * 1000) / 1000;
  }

  const durationValue = toNumberOrNull(durationMin);
  if (Number.isFinite(durationValue)) {
    payload.duration = Math.round(durationValue * 1000) / 1000;
  }

  try {
    await db.ref(`${ROUTE_CACHE_ROOT}/${sanitizeKey(key)}`).update(payload);
    return { key, polyline: encodedPolyline };
  } catch (error) {
    console.warn(`[FirebaseRealtime] route_cache upsert failed: ${error.message}`);
    return null;
  }
};

export const updateDeliveryPresenceRealtime = async ({
  deliveryId,
  isOnline,
  latitude = null,
  longitude = null,
  name = '',
  phone = '',
  zoneId = '',
  isActive = true,
  transportType = 'bike'
}) => {
  if (!deliveryId) return false;

  const db = getDb();
  if (!db) return false;

  const deliveryKey = sanitizeKey(deliveryId);
  const lat = toNumberOrNull(latitude);
  const lng = toNumberOrNull(longitude);
  const timestamp = Date.now();

  const payload = stripUndefined({
    status: isOnline ? 'online' : 'offline',
    last_updated: timestamp
  });

  if (isValidCoordinate(lat, lng)) {
    payload.lat = lat;
    payload.lng = lng;
  }

  if (name) payload.name = name;
  if (phone) payload.phone = phone;
  if (zoneId) payload.zone_id = zoneId;

  try {
    await db.ref(`${DELIVERY_ROOT}/${deliveryKey}`).update(payload);

    const driverPayload = stripUndefined({
      id: String(deliveryId),
      name: name || undefined,
      mobile: phone || undefined,
      is_available: Boolean(isOnline),
      is_active: isActive === false ? 0 : 1,
      transport_type: transportType || 'bike',
      status: isOnline ? 'online' : 'offline',
      updated_at: timestamp,
      date: new Date(timestamp).toISOString()
    });

    if (isValidCoordinate(lat, lng)) {
      driverPayload.l = [lat, lng];
    }

    await db.ref(`${DRIVERS_ROOT}/driver_${deliveryKey}`).update(driverPayload);
    return true;
  } catch (error) {
    console.warn(`[FirebaseRealtime] delivery_boys update failed: ${error.message}`);
    return false;
  }
};

export const upsertActiveOrderRealtime = async ({
  orderId,
  orderMongoId = '',
  deliveryId = '',
  status = 'assigned',
  phase = 'assigned',
  polyline = null,
  routePoints = null,
  totalDistanceKm = null,
  durationMin = null,
  restaurant = null,
  customer = null,
  deliveryFee = null,
  riderLat = null,
  riderLng = null,
  createdAtMs = null
}) => {
  if (!orderId) return false;

  const db = getDb();
  if (!db) return false;

  const orderKey = sanitizeKey(orderId);
  const orderRef = db.ref(`${ORDER_ROOT}/${orderKey}`);
  const deliveryKey = deliveryId ? sanitizeKey(deliveryId) : null;
  const timestamp = Date.now();

  const restaurantLat = toNumberOrNull(restaurant?.lat);
  const restaurantLng = toNumberOrNull(restaurant?.lng);
  const customerLat = toNumberOrNull(customer?.lat);
  const customerLng = toNumberOrNull(customer?.lng);
  const boyLat = toNumberOrNull(riderLat);
  const boyLng = toNumberOrNull(riderLng);
  const distance = toNumberOrNull(totalDistanceKm);
  const duration = toNumberOrNull(durationMin);
  const deliveryFeeValue = toNumberOrNull(deliveryFee);

  const normalizedPoints = normalizeRoutePoints(routePoints || []);
  const encodedPolyline = (typeof polyline === 'string' && polyline.trim())
    ? polyline.trim()
    : encodePolyline(normalizedPoints);

  const payload = stripUndefined({
    status: status || 'assigned',
    phase: phase || undefined,
    last_updated: timestamp
  });

  if (deliveryId) payload.boy_id = String(deliveryId);
  if (orderMongoId) payload.order_mongo_id = String(orderMongoId);
  if (Number.isFinite(deliveryFeeValue)) payload.delivery_fee = Math.round(deliveryFeeValue * 100) / 100;
  if (Number.isFinite(distance)) payload.distance = Math.round(distance * 1000) / 1000;
  if (Number.isFinite(duration)) payload.duration = Math.round(duration * 1000) / 1000;
  if (encodedPolyline) payload.polyline = encodedPolyline;
  if (isValidCoordinate(restaurantLat, restaurantLng)) {
    payload.restaurant_lat = restaurantLat;
    payload.restaurant_lng = restaurantLng;
  }
  if (isValidCoordinate(customerLat, customerLng)) {
    payload.customer_lat = customerLat;
    payload.customer_lng = customerLng;
  }
  if (isValidCoordinate(boyLat, boyLng)) {
    payload.boy_lat = boyLat;
    payload.boy_lng = boyLng;
  }

  try {
    await orderRef.transaction((current) => {
      const existing = (current && typeof current === 'object') ? current : {};
      const createdAt = Number.isFinite(Number(createdAtMs))
        ? Number(createdAtMs)
        : (existing.created_at || timestamp);
      return {
        ...existing,
        ...payload,
        created_at: createdAt
      };
    });

    if (deliveryKey) {
      await db.ref(`${DELIVERY_ROOT}/${deliveryKey}`).update({
        active_order_id: orderKey,
        active_order_status: status || 'assigned',
        active_order_phase: phase || 'assigned',
        last_updated: timestamp
      });
    }

    if (encodedPolyline && normalizedPoints.length >= 2) {
      const start = normalizedPoints[0];
      const end = normalizedPoints[normalizedPoints.length - 1];
      await upsertRouteCacheRealtime({
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        polyline: encodedPolyline,
        routePoints: normalizedPoints,
        distanceKm: distance,
        durationMin: duration
      });
    }

    return true;
  } catch (error) {
    console.warn(`[FirebaseRealtime] active_orders upsert failed: ${error.message}`);
    return false;
  }
};

export const updateActiveOrderRiderLocationRealtime = async ({
  deliveryId,
  latitude,
  longitude,
  heading = 0,
  speed = 0,
  accuracy = null,
  orderId = null
}) => {
  if (!deliveryId) return false;

  const db = getDb();
  if (!db) return false;

  const deliveryKey = sanitizeKey(deliveryId);
  const lat = toNumberOrNull(latitude);
  const lng = toNumberOrNull(longitude);
  if (!isValidCoordinate(lat, lng)) return false;

  const timestamp = Date.now();
  const headingValue = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const speedValue = Number.isFinite(Number(speed)) ? Number(speed) : 0;
  const accuracyValue = Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined;

  try {
    await db.ref(`${DELIVERY_ROOT}/${deliveryKey}`).update({
      lat,
      lng,
      heading: headingValue,
      speed: speedValue,
      accuracy: accuracyValue,
      last_updated: timestamp
    });

    await db.ref(`${DRIVERS_ROOT}/driver_${deliveryKey}`).update(stripUndefined({
      l: [lat, lng],
      bearing: headingValue,
      speed: speedValue,
      accuracy: accuracyValue,
      is_available: true,
      updated_at: timestamp
    }));

    const activeOrderKey = orderId
      ? sanitizeKey(orderId)
      : sanitizeKey((await db.ref(`${DELIVERY_ROOT}/${deliveryKey}/active_order_id`).get()).val());
    if (!activeOrderKey) return true;

    await db.ref(`${ORDER_ROOT}/${activeOrderKey}`).update({
      boy_lat: lat,
      boy_lng: lng,
      last_updated: timestamp
    });

    return true;
  } catch (error) {
    console.warn(`[FirebaseRealtime] rider location update failed: ${error.message}`);
    return false;
  }
};

export const completeActiveOrderRealtime = async ({
  orderId,
  deliveryId,
  finalStatus = 'delivered'
}) => {
  if (!orderId) return false;

  const db = getDb();
  if (!db) return false;

  const orderKey = sanitizeKey(orderId);
  const deliveryKey = deliveryId ? sanitizeKey(deliveryId) : null;
  const timestamp = Date.now();

  try {
    await db.ref(`${ORDER_ROOT}/${orderKey}`).update({
      status: finalStatus || 'delivered',
      phase: 'completed',
      completed_at: timestamp,
      last_updated: timestamp
    });

    if (deliveryKey) {
      await db.ref(`${DELIVERY_ROOT}/${deliveryKey}`).update({
        active_order_id: null,
        active_order_status: null,
        active_order_phase: null,
        last_updated: timestamp
      });
    }

    return true;
  } catch (error) {
    console.warn(`[FirebaseRealtime] active_orders complete failed: ${error.message}`);
    return false;
  }
};

const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const getNearestOnlineDeliveryIdsFromRealtime = async ({
  restaurantLat,
  restaurantLng,
  maxDistanceKm = 50,
  limit = 100
}) => {
  const db = getDb();
  if (!db) return [];

  const rLat = toNumberOrNull(restaurantLat);
  const rLng = toNumberOrNull(restaurantLng);
  if (!isValidCoordinate(rLat, rLng)) return [];

  try {
    const snapshot = await db
      .ref(DELIVERY_ROOT)
      .orderByChild('status')
      .equalTo('online')
      .get();

    if (!snapshot.exists()) return [];

    const rows = snapshot.val() || {};
    return Object.entries(rows)
      .map(([deliveryId, data]) => {
        const lat = toNumberOrNull(data?.lat);
        const lng = toNumberOrNull(data?.lng);
        if (!isValidCoordinate(lat, lng)) return null;
        const distance = haversineDistanceKm(rLat, rLng, lat, lng);
        return { deliveryId, distance };
      })
      .filter(Boolean)
      .filter((row) => row.distance <= maxDistanceKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.max(1, Number(limit) || 100));
  } catch (error) {
    console.warn(`[FirebaseRealtime] nearest partner lookup failed: ${error.message}`);
    return [];
  }
};

export const updateUserLocationRealtime = async ({
  userId,
  latitude,
  longitude,
  accuracy = null,
  address = '',
  area = '',
  city = '',
  state = '',
  formattedAddress = '',
  postalCode = '',
  street = '',
  streetNumber = ''
}) => {
  if (!userId) return false;

  const db = getDb();
  if (!db) return false;

  const lat = toNumberOrNull(latitude);
  const lng = toNumberOrNull(longitude);
  if (!isValidCoordinate(lat, lng)) return false;

  const timestamp = Date.now();
  const payload = stripUndefined({
    lat,
    lng,
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined,
    address: address || undefined,
    area: area || undefined,
    city: city || undefined,
    state: state || undefined,
    formatted_address: formattedAddress || undefined,
    postal_code: postalCode || undefined,
    street: street || undefined,
    street_number: streetNumber || undefined,
    last_updated: timestamp
  });

  try {
    await db.ref(`${USERS_ROOT}/${sanitizeKey(userId)}`).update(payload);
    return true;
  } catch (error) {
    console.warn(`[FirebaseRealtime] users location update failed: ${error.message}`);
    return false;
  }
};
