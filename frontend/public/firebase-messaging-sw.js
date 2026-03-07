// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the app tab is not focused
// Place this file at: frontend/public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config — must match your frontend/.env values
const firebaseConfig = {
    apiKey: 'AIzaSyBXHhy9s_CuNdGNQ8ed8rload8McZg-BhU',
    authDomain: 'grhapoch-a141d.firebaseapp.com',
    projectId: 'grhapoch-a141d',
    storageBucket: 'grhapoch-a141d.firebasestorage.app',
    messagingSenderId: '243919511808',
    appId: '1:243919511808:web:2b7a13d1e4db26a64893e5',
    measurementId: 'G-VZW0T66ZWX'
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ─── Deduplication: track recently shown notification tags ───────────────────
const recentTags = new Set();
const TAG_TTL_MS = 5000; // 5 s window to suppress duplicates

function isDuplicate(tag) {
    if (!tag) return false;
    if (recentTags.has(tag)) return true;
    recentTags.add(tag);
    setTimeout(() => recentTags.delete(tag), TAG_TTL_MS);
    return false;
}

// ─── Handle background messages ──────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || data.title || 'GrhaPoch';
    const body = notification.body || data.body || '';
    const tag = data.tag || `fcm_${Date.now()}`;

    // Suppress duplicate notifications with the same tag
    if (isDuplicate(tag)) {
        console.log('[SW] Duplicate notification suppressed, tag:', tag);
        return;
    }

    const options = {
        body,
        icon: notification.icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag,                    // ← browser replaces existing notification with same tag
        renotify: false,        // don't re-buzz for same tag
        requireInteraction: false,
        data: { ...data, url: data.link || '/' },
        actions: data.link
            ? [{ action: 'open', title: 'View' }]
            : []
    };

    if (notification.image || data.imageUrl) {
        options.image = notification.image || data.imageUrl;
    }

    return self.registration.showNotification(title, options);
});

// ─── Handle notification click ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const targetUrl = data.url || data.link || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing tab if already open
            for (const client of clientList) {
                if ('focus' in client) {
                    // If the client is on the same origin, navigate and focus
                    client.focus();
                    if (client.url !== targetUrl && 'navigate' in client) {
                        return client.navigate(targetUrl);
                    }
                    return;
                }
            }
            // Open a new window/tab
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ─── Service worker lifecycle ─────────────────────────────────────────────────
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
