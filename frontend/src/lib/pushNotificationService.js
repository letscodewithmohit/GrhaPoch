/**
 * Push Notification Service
 * Handles FCM token registration for all three user roles:
 *   - user       → POST /api/notification/fcm/user/save
 *   - delivery   → POST /api/notification/fcm/delivery/save
 *   - restaurant → POST /api/notification/fcm/restaurant/save
 *
 * Anti-double-notification strategy:
 *   1. Service worker uses notification `tag` – browser replaces existing toast with same tag.
 *   2. Frontend foreground handler deduplicates via an in-memory Set with TTL.
 *   3. Token registration is guarded by localStorage so we only register once per session
 *      (or forced on fresh login).
 */

// NOTE: firebase/messaging is imported lazily to prevent Vite from bundling
// service-worker globals into the main app bundle (which causes the 500 error).
import { getFirebaseMessaging } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// ─── Storage keys ─────────────────────────────────────────────────────────────
const TOKEN_KEY_MAP = {
    user: 'fcm_token_user',
    delivery: 'fcm_token_delivery',
    restaurant: 'fcm_token_restaurant'
};

const ENDPOINT_MAP = {
    user: '/notification/fcm/user/save',
    delivery: '/notification/fcm/delivery/save',
    restaurant: '/notification/fcm/restaurant/save'
};

// Auth token key per role (matches existing localStorage convention)
const AUTH_KEY_MAP = {
    user: () =>
        localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken'),
    delivery: () =>
        localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken'),
    restaurant: () =>
        localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken')
};

// ─── In-memory dedup set for foreground notifications ─────────────────────────
const shownTags = new Set();
const DEDUP_TTL_MS = 5000;

function isForegroundDuplicate(tag) {
    if (!tag) return false;
    if (shownTags.has(tag)) return true;
    shownTags.add(tag);
    setTimeout(() => shownTags.delete(tag), DEDUP_TTL_MS);
    return false;
}

// ─── Service Worker Registration ─────────────────────────────────────────────
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        throw new Error('Service Workers are not supported in this browser');
    }
    try {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await registration.update();
        return registration;
    } catch (error) {
        console.error('[FCM] Service Worker registration failed:', error);
        throw error;
    }
}

// ─── Permission Request ───────────────────────────────────────────────────────
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('[FCM] Notifications not supported in this browser');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

// ─── Get FCM Token ────────────────────────────────────────────────────────────
async function getFCMToken(registration) {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    if (!VAPID_KEY) {
        console.error('[FCM] VITE_FIREBASE_VAPID_KEY is not set in frontend .env');
        return null;
    }

    try {
        const { getToken } = await import('firebase/messaging');
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
        });
        return token || null;
    } catch (err) {
        console.error('[FCM] Error getting FCM token:', err.message);
        return null;
    }
}

// ─── Register Token with Backend ─────────────────────────────────────────────
async function saveTokenToBackend(role, token) {
    const authToken = AUTH_KEY_MAP[role]?.();
    if (!authToken) {
        console.warn(`[FCM] No auth token found for role: ${role}`);
        return false;
    }

    const endpoint = ENDPOINT_MAP[role];
    if (!endpoint) {
        console.error(`[FCM] Unknown role: ${role}`);
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ token, platform: 'web' })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('[FCM] Backend rejected token:', err.message || response.status);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[FCM] Network error saving token to backend:', error.message);
        return false;
    }
}

// ─── Public: Register FCM Token ───────────────────────────────────────────────
/**
 * Call this immediately after a successful login.
 *
 * @param {'user'|'delivery'|'restaurant'} role
 * @param {boolean} forceUpdate - bypass the localStorage cache
 */
export async function registerFCMToken(role, forceUpdate = false) {
    try {
        if (!role || !ENDPOINT_MAP[role]) {
            console.warn('[FCM] registerFCMToken: invalid role', role);
            return null;
        }

        const storageKey = TOKEN_KEY_MAP[role];

        // Skip if already registered this session (unless forced)
        const cached = localStorage.getItem(storageKey);
        if (cached && !forceUpdate) {
            console.log(`[FCM] Token already registered for ${role}`);
            return cached;
        }

        // 1. Request browser permission
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
            console.warn('[FCM] Notification permission not granted');
            return null;
        }

        // 2. Register service worker
        const registration = await registerServiceWorker();

        // 3. Get FCM token
        const token = await getFCMToken(registration);
        if (!token) {
            console.warn('[FCM] Could not obtain FCM token');
            return null;
        }

        // 4. Skip backend call if token hasn't changed
        if (token === cached && !forceUpdate) {
            console.log('[FCM] FCM token unchanged – no backend update needed');
            return token;
        }

        // 5. Persist to backend
        const saved = await saveTokenToBackend(role, token);
        if (saved) {
            localStorage.setItem(storageKey, token);
            console.log(`[FCM] Token registered for ${role}`);
        }

        return token;
    } catch (error) {
        console.error('[FCM] registerFCMToken error:', error.message);
        return null; // Non-critical – don't break login flow
    }
}

// ─── Public: Remove FCM Token on Logout ───────────────────────────────────────
/**
 * Call this when user logs out so the server stops sending push notifications.
 *
 * @param {'user'|'delivery'|'restaurant'} role
 */
export async function removeFCMToken(role) {
    try {
        const storageKey = TOKEN_KEY_MAP[role];
        const token = localStorage.getItem(storageKey);
        if (!token) return;

        const authToken = AUTH_KEY_MAP[role]?.();
        const removeEndpoint = ENDPOINT_MAP[role]?.replace('/save', '/remove');

        if (authToken && removeEndpoint) {
            await fetch(`${API_BASE}${removeEndpoint}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`
                },
                body: JSON.stringify({ token, platform: 'web' })
            });
        }

        localStorage.removeItem(storageKey);
        console.log(`[FCM] Token removed for ${role}`);
    } catch (error) {
        console.warn('[FCM] removeFCMToken error (non-critical):', error.message);
    }
}

// ─── Public: Setup Foreground Notification Handler ────────────────────────────
/**
 * Call once in App.jsx (or equivalent root component) after initialization.
 * Handles notifications when the app tab is in the foreground.
 *
 * @param {function} onNotification - optional callback(payload)
 * @returns {function} unsubscribe function
 */
export async function setupForegroundNotificationHandler(onNotification) {
    try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return () => { };

        const { onMessage } = await import('firebase/messaging');
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('[FCM] Foreground message received:', payload);

            const data = payload.data || {};
            const notification = payload.notification || {};
            const tag = data.tag || `fg_${Date.now()}`;

            // Suppress duplicates (same tag within TTL window)
            if (isForegroundDuplicate(tag)) {
                console.log('[FCM] Foreground duplicate suppressed, tag:', tag);
                return;
            }

            // Show browser notification if permission granted
            if (Notification.permission === 'granted') {
                const title = notification.title || data.title || 'GrhaPoch';
                const body = notification.body || data.body || '';

                new Notification(title, {
                    body,
                    icon: notification.icon || '/favicon.ico',
                    tag,
                    renotify: false,
                    data: { url: data.link || '/' }
                });
            }

            // Let the caller handle additional logic (e.g., show in-app toast, refresh data)
            if (typeof onNotification === 'function') {
                onNotification(payload);
            }
        });

        return unsubscribe;
    } catch (error) {
        console.warn('[FCM] setupForegroundNotificationHandler error:', error.message);
        return () => { };
    }
}

/**
 * Initialize service worker registration silently on app load.
 * Actual token registration happens after login.
 */
export async function initializePushNotifications() {
    try {
        if (!('serviceWorker' in navigator)) return;
        await registerServiceWorker();
    } catch (error) {
        console.warn('[FCM] initializePushNotifications (non-critical):', error.message);
    }
}
