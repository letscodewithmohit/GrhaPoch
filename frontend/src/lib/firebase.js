import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Firebase configuration - fallback to hardcoded values if env vars are not available
const resolvedProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "zomato-607fa";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC_TqpDR7LNHxFEPd8cGjl_ka_Rj0ebECA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "zomato-607fa.firebaseapp.com",
  projectId: resolvedProjectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1065631021082:web:7424afd0ad2054ed6879a3",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1065631021082",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "zomato-607fa.firebasestorage.app",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7JJV7JYVRX",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${resolvedProjectId}-default-rtdb.firebaseio.com`
};

// Validate Firebase configuration
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];
const missingFields = requiredFields.filter((field) => !firebaseConfig[field] || firebaseConfig[field] === 'undefined');

if (missingFields.length > 0) {
  console.error('Firebase configuration is missing required fields:', missingFields);
  console.error('Current config:', firebaseConfig);
  console.error('Environment variables:', {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  });
  throw new Error(`Firebase configuration error: Missing fields: ${missingFields.join(', ')}. Please check your .env file and restart the dev server.`);
}

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;
let firebaseDatabase;

// Function to ensure Firebase is initialized
function ensureFirebaseInitialized() {
  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);





    } else {
      app = existingApps[0];

    }

    // Initialize Auth - ensure it's connected to the app
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
      if (!firebaseAuth) {
        throw new Error('Failed to get Firebase Auth instance');
      }




    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      // Add scopes if needed
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      // Note: Don't set custom client_id - Firebase uses its own OAuth client

    }

    if (!firebaseDatabase) {
      try {
        firebaseDatabase = getDatabase(app);
      } catch (dbError) {
        console.warn('Firebase Realtime Database initialization failed:', dbError);
      }
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    console.error('Firebase config used:', firebaseConfig);
    throw error;
  }
}

// Initialize immediately
ensureFirebaseInitialized();

export const firebaseApp = app;
export { firebaseAuth, googleProvider, firebaseDatabase as database, ensureFirebaseInitialized };