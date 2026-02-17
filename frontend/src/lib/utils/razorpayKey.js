/**
 * Razorpay API Key Utility
 * Fetches API key from backend database instead of .env file
 */

let cachedKeyId = null;
let keyIdPromise = null;

/**
 * Get Razorpay Key ID from backend
 * Uses caching to avoid multiple requests
 * @returns {Promise<string>} Razorpay Key ID
 */
export async function getRazorpayKeyId() {
    // Return cached key if available
    if (cachedKeyId) {
        return cachedKeyId;
    }

    // Return existing promise if already fetching
    if (keyIdPromise) {
        return keyIdPromise;
    }

    // Fetch from backend
    keyIdPromise = (async () => {
        try {
            const { adminAPI } = await import('../api/index.js');
            const response = await adminAPI.getPublicEnvVariables();

            if (response.data.success && response.data.data?.VITE_RAZORPAY_KEY_ID) {
                cachedKeyId = response.data.data.VITE_RAZORPAY_KEY_ID;
                return cachedKeyId;
            }

            // Fallback to env var if not in database
            const envKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
            if (envKey) {
                cachedKeyId = envKey;
                return cachedKeyId;
            }

            console.warn('⚠️ Razorpay Key ID not found in database or .env. Payment may fail.');
            return '';
        } catch (error) {
            console.warn('Failed to fetch Razorpay Key ID from backend:', error.message);
            // Fallback to env var on error
            return import.meta.env.VITE_RAZORPAY_KEY_ID || '';
        } finally {
            keyIdPromise = null;
        }
    })();

    return keyIdPromise;
}

/**
 * Clear cached Key ID
 */
export function clearRazorpayKeyIdCache() {
    cachedKeyId = null;
    keyIdPromise = null;
}
