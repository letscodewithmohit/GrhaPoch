# Firebase Realtime Setup (Delivery Tracking)

This project uses Firebase Realtime Database for:
- live delivery partner presence (`delivery_boys`)
- driver-compatible feed (`drivers`)
- active order tracking (`active_orders`)
- route cache (`route_cache`)
- user live locations (`users`)

## 1) Required backend env

Set these in `backend/.env`:

```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_DATABASE_URL=https://<project>-default-rtdb.<region>.firebasedatabase.app/
```

Notes:
- keep `\n` in `FIREBASE_PRIVATE_KEY` (the backend converts it to real newlines).
- do not commit real credentials.

## 2) Firebase Console config

1. Create/open your Firebase project.
2. Enable Realtime Database.
3. Use production rules (example below).
4. Add index hints in rules for query performance.

Example rules:

```json
{
  "rules": {
    "delivery_boys": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["status", "last_updated"]
    },
    "active_orders": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["status", "boy_id", "last_updated"]
    },
    "route_cache": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "drivers": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["is_available", "updated_at"]
    },
    "users": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["last_updated"]
    }
  }
}
```

For local testing only, you can temporarily relax rules.

## 3) Data format used by backend

### `delivery_boys/{deliveryId}`

```json
{
  "status": "online",
  "lat": 22.7110,
  "lng": 75.9002,
  "last_updated": 1771919094308,
  "active_order_id": "ORD-1771852793961-237"
}
```

### `active_orders/{orderId}`

```json
{
  "boy_id": "69994ddcf9a33ae7aebeea9b",
  "boy_lat": 22.71105,
  "boy_lng": 75.90018,
  "created_at": 1771852982569,
  "customer_lat": 22.71105,
  "customer_lng": 75.90022,
  "distance": 0.067,
  "duration": 0.2333,
  "last_updated": 1771919094662,
  "polyline": "{yriCcfgnM~A??[",
  "restaurant_lat": 22.71149,
  "restaurant_lng": 75.89997,
  "status": "assigned",
  "phase": "en_route_to_pickup"
}
```

### `drivers/driver_{deliveryId}`

```json
{
  "id": "69994ddcf9a33ae7aebeea9b",
  "name": "Delivery Rider",
  "mobile": "+91xxxxxxx",
  "is_available": true,
  "is_active": 1,
  "transport_type": "bike",
  "status": "online",
  "l": [22.71105, 75.90018],
  "updated_at": 1771919094662,
  "date": "2026-02-25T12:30:10.000Z"
}
```

### `users/{userId}`

```json
{
  "lat": 22.71105,
  "lng": 75.90013,
  "accuracy": 64,
  "address": "Indore district",
  "area": "Indore district",
  "city": "Indore",
  "state": "Madhya Pradesh",
  "formatted_address": "Indore district, Indore, Madhya Pradesh",
  "last_updated": 1771661521706
}
```

### `route_cache/{routeKey}`

```json
{
  "polyline": "{yriCcfgnM~A??[",
  "distance": 0.067,
  "duration": 0.2333,
  "cached_at": 1771919094000,
  "expires_at": 1772523894000
}
```

Route key format is coordinate-based (e.g. `22_7115_75_9_22_7111_75_9002` style).

## 4) Backend integration points already wired

- startup init: `backend/server.js`
- Firebase init module: `backend/config/firebaseRealtime.js`
- Firebase RTDB service: `backend/modules/delivery/services/firebaseRealtimeService.js`
- delivery location sync: `backend/modules/delivery/controllers/deliveryLocationController.js`
- user location sync: `backend/modules/user/controllers/userController.js`
- order flow sync: `backend/modules/delivery/controllers/deliveryOrdersController.js`
  - accept order
  - confirm order id (out for delivery)
  - reached drop
  - complete delivery

## 5) Expected logs

On backend start:

```txt
[FirebaseRealtime] initialized (https://...firebasedatabase.app)
```

If config is missing/invalid, logs will show clear `[FirebaseRealtime]` warnings.

## 6) One-time backfill (existing Mongo data)

To push existing users + drivers once:

```bash
node scripts/backfillFirebaseUsersDrivers.js
```

This syncs:
- users with `currentLocation` -> `users/{userId}`
- delivery partners -> `delivery_boys/{deliveryId}` and `drivers/driver_{deliveryId}`
