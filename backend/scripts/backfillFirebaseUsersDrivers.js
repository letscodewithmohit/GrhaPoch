import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import User from '../modules/auth/models/User.js';
import Delivery from '../modules/delivery/models/Delivery.js';
import {
  initializeFirebaseRealtime,
  isFirebaseRealtimeAvailable
} from '../config/firebaseRealtime.js';
import {
  updateUserLocationRealtime,
  updateDeliveryPresenceRealtime
} from '../modules/delivery/services/firebaseRealtimeService.js';

dotenv.config();

const run = async () => {
  await connectDB();
  initializeFirebaseRealtime();

  if (!isFirebaseRealtimeAvailable()) {
    throw new Error('Firebase realtime is not available. Check FIREBASE_* env vars.');
  }

  let userCount = 0;
  let driverCount = 0;

  const users = await User.find({
    'currentLocation.latitude': { $exists: true, $ne: null },
    'currentLocation.longitude': { $exists: true, $ne: null }
  }).select('_id currentLocation').lean();

  for (const user of users) {
    const location = user.currentLocation || {};
    const ok = await updateUserLocationRealtime({
      userId: user._id?.toString?.() || user._id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      address: location.address,
      area: location.area,
      city: location.city,
      state: location.state,
      formattedAddress: location.formattedAddress,
      postalCode: location.postalCode,
      street: location.street,
      streetNumber: location.streetNumber
    });
    if (ok) userCount++;
  }

  const drivers = await Delivery.find({})
    .select('_id name phone isActive vehicle.type availability')
    .lean();

  for (const driver of drivers) {
    const coords = driver?.availability?.currentLocation?.coordinates || [];
    const lng = Array.isArray(coords) ? coords[0] : null;
    const lat = Array.isArray(coords) ? coords[1] : null;

    const ok = await updateDeliveryPresenceRealtime({
      deliveryId: driver._id?.toString?.() || driver._id,
      isOnline: Boolean(driver?.availability?.isOnline),
      latitude: lat,
      longitude: lng,
      name: driver?.name,
      phone: driver?.phone,
      isActive: driver?.isActive !== false,
      transportType: driver?.vehicle?.type || 'bike'
    });
    if (ok) driverCount++;
  }

  console.log(`[Backfill] users synced: ${userCount}/${users.length}`);
  console.log(`[Backfill] drivers synced: ${driverCount}/${drivers.length}`);
};

run()
  .catch((error) => {
    console.error('[Backfill] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (e) {
      // no-op
    }
  });

