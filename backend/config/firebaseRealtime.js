import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';

let realtimeDb = null;
let realtimeReady = false;
let initAttempted = false;
let lastInitError = null;
let realtimeApp = null;
const REALTIME_APP_NAME = 'realtime-db';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizePrivateKey = (privateKey) => {
  const key = trim(privateKey);
  if (!key) return '';
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
};

const getCredentialsFromEnv = () => {
  const projectId = trim(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = trim(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
};

const getDatabaseUrl = () => {
  const databaseURL = trim(process.env.FIREBASE_DATABASE_URL);
  return databaseURL ? databaseURL.replace(/\/+$/, '') : '';
};

export const initializeFirebaseRealtime = () => {
  if (realtimeReady && realtimeDb) {
    return realtimeDb;
  }

  initAttempted = true;
  lastInitError = null;

  const databaseURL = getDatabaseUrl();
  if (!databaseURL) {
    lastInitError = new Error('FIREBASE_DATABASE_URL is missing');
    console.warn('[FirebaseRealtime] not available: FIREBASE_DATABASE_URL is missing');
    return null;
  }

  try {
    const namedAppExists = getApps().some((app) => app.name === REALTIME_APP_NAME);

    if (namedAppExists) {
      realtimeApp = getApp(REALTIME_APP_NAME);
    } else {
      const credentials = getCredentialsFromEnv();

      if (credentials) {
        realtimeApp = initializeApp(
          {
            credential: cert(credentials),
            databaseURL
          },
          REALTIME_APP_NAME
        );
      } else if (getApps().length > 0) {
        // Reuse an already initialized default app (for example auth-only startup path).
        realtimeApp = getApps()[0];
      } else {
        lastInitError = new Error('Firebase service credentials are missing');
        console.warn(
          '[FirebaseRealtime] not available: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
        );
        return null;
      }
    }

    realtimeDb = getDatabaseWithUrl(databaseURL, realtimeApp);
    realtimeReady = true;
    return realtimeDb;
  } catch (error) {
    lastInitError = error;
    realtimeDb = null;
    realtimeReady = false;
    console.warn(`[FirebaseRealtime] initialization failed: ${error.message}`);
    return null;
  }
};

export const getFirebaseRealtimeDb = () => {
  if (realtimeReady && realtimeDb) {
    return realtimeDb;
  }

  const db = initializeFirebaseRealtime();
  if (!db) {
    console.warn('[FirebaseRealtime] not initialized. Call initializeFirebaseRealtime() first.');
    return null;
  }

  return db;
};

export const isFirebaseRealtimeAvailable = () => Boolean(realtimeReady && realtimeDb);

export const getFirebaseRealtimeStatus = () => ({
  initialized: realtimeReady,
  attempted: initAttempted,
  hasDb: Boolean(realtimeDb),
  lastError: lastInitError ? lastInitError.message : null
});
