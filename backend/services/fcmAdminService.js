import admin from 'firebase-admin';

/** Lazy-initialise messaging so this file is safe to import even before
 *  Firebase Admin SDK is fully booted (firebaseAuthService handles init). */
function getMessaging() {
    try {
        return admin.messaging();
    } catch (err) {
        console.error('[FCM] Firebase Admin not ready yet:', err.message);
        return null;
    }
}

/**
 * Send a push notification to one or more FCM tokens.
 *
 * @param {string[]} tokens   - Array of FCM registration tokens
 * @param {Object}   payload  - { title, body, data?, imageUrl? }
 * @returns {Promise<{successCount, failureCount, invalidTokens}>}
 */
export async function sendPushNotification(tokens, payload) {
    if (!tokens || tokens.length === 0) {
        return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const messaging = getMessaging();
    if (!messaging) {
        console.warn('[FCM] Messaging not available – skipping push notification');
        return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
    }

    // Deduplicate tokens
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (uniqueTokens.length === 0) {
        return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // Build data map – FCM only accepts string values in data
    const dataMap = {};
    if (payload.data && typeof payload.data === 'object') {
        for (const [key, val] of Object.entries(payload.data)) {
            dataMap[key] = String(val ?? '');
        }
    }

    // Add a unique tag to prevent duplicate notifications on the client
    if (!dataMap.tag) {
        dataMap.tag = `${payload.data?.type || 'notification'}_${Date.now()}`;
    }

    const message = {
        notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {})
        },
        data: dataMap,
        // WebPush configuration for browser notifications
        webpush: {
            notification: {
                title: payload.title,
                body: payload.body,
                icon: payload.icon || '/favicon.ico',
                badge: '/favicon.ico',
                tag: dataMap.tag,          // ← key for de-duplication
                renotify: false,           // don't re-buzz for same tag
                requireInteraction: false,
                ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
                data: dataMap
            },
            fcm_options: {
                // Link opened when notification is clicked
                link: payload.data?.link || '/'
            }
        },
        tokens: uniqueTokens
    };

    try {
        const response = await messaging.sendEachForMulticast(message);

        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const errCode = resp.error?.code || '';
                if (
                    errCode === 'messaging/registration-token-not-registered' ||
                    errCode === 'messaging/invalid-registration-token'
                ) {
                    invalidTokens.push(uniqueTokens[idx]);
                }
            }
        });

        console.log(`[FCM] Sent: ${response.successCount} success, ${response.failureCount} failed`);
        if (invalidTokens.length) {
            console.log(`[FCM] Invalid tokens to clean up: ${invalidTokens.length}`);
        }

        return {
            successCount: response.successCount,
            failureCount: response.failureCount,
            invalidTokens
        };
    } catch (error) {
        console.error('[FCM] Error sending multicast notification:', error.message);
        return { successCount: 0, failureCount: uniqueTokens.length, invalidTokens: [] };
    }
}

/**
 * Remove invalid tokens from a model document.
 * Pass in the document (not lean), the field name(s) of the token array(s), and the
 * array of invalid tokens returned from sendPushNotification.
 * 
 * @param {Object} doc - Mongoose document
 * @param {string|string[]} fieldNames - Field or array of fields like ['fcmTokensWeb', 'fcmTokensMobile']
 * @param {string[]} invalidTokens - Tokens to remove
 */
export async function cleanupInvalidTokens(doc, fieldNames, invalidTokens) {
    if (!doc || !invalidTokens || invalidTokens.length === 0) return;
    const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    try {
        let anyRemoved = false;
        fields.forEach(field => {
            const before = (doc[field] || []).length;
            doc[field] = (doc[field] || []).filter(t => !invalidTokens.includes(t));
            if ((doc[field] || []).length < before) anyRemoved = true;
        });

        if (anyRemoved) {
            await doc.save();
            console.log(`[FCM] Cleaned invalid tokens from user document`);
        }
    } catch (err) {
        console.error('[FCM] Error cleaning invalid tokens:', err.message);
    }
}
