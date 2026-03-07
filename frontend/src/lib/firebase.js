import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
// NOTE: firebase/messaging is imported lazily inside getFirebaseMessaging()
// to prevent Vite from evaluating service-worker-specific globals at bundle time.

// Firebase configuration - fallback to hardcoded values if env vars are not available
const resolvedProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "grhapoch-a141d";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBXHhy9s_CuNdGNQ8ed8rload8McZg-BhU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "grhapoch-a141d.firebaseapp.com",
  projectId: resolvedProjectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:243919511808:web:2b7a13d1e4db26a64893e5",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "243919511808",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "grhapoch-a141d.firebasestorage.app",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-VZW0T66ZWX",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${resolvedProjectId}-default-rtdb.asia-southeast1.firebasedatabase.app`
};

// Validate Firebase configuration
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];
const missingFields = requiredFields.filter((field) => !firebaseConfig[field] || firebaseConfig[field] === 'undefined');

if (missingFields.length > 0) {
  console.error('Firebase configuration is missing required fields:', missingFields);
  throw new Error(`Firebase configuration error: Missing fields: ${missingFields.join(', ')}. Please check your .env file and restart the dev server.`);
}

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;
let firebaseDatabase;
let firebaseMessaging = null;

// Function to ensure Firebase is initialized
function ensureFirebaseInitialized() {
  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = existingApps[0];
    }

    // Initialize Auth
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
    }

    // Initialize Realtime Database
    if (!firebaseDatabase) {
      try {
        firebaseDatabase = getDatabase(app);
      } catch (dbError) {
        console.warn('Firebase Realtime Database initialization failed:', dbError);
      }
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

/**
 * Get the Firebase Messaging instance.
 * Returns null if not supported (e.g., Safari without HTTPS, service workers unavailable).
 */
export async function getFirebaseMessaging() {
  if (firebaseMessaging) return firebaseMessaging;

  try {
    // Lazy import firebase/messaging – avoids Vite bundling service-worker globals at top level
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Firebase Messaging is not supported in this browser');
      return null;
    }
    ensureFirebaseInitialized();
    firebaseMessaging = getMessaging(app);
    return firebaseMessaging;
  } catch (err) {
    console.warn('[FCM] Failed to initialize Firebase Messaging:', err.message);
    return null;
  }
}

// Initialize immediately
ensureFirebaseInitialized();

export const firebaseApp = app;
export { firebaseAuth, googleProvider, firebaseDatabase as database, ensureFirebaseInitialized };