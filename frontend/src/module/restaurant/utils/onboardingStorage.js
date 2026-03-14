
const DB_NAME = 'GrhaPochOnboardingDB';
const DB_VERSION = 1;
const STORE_NAME = 'onboarding_files';

/**
 * Direct IndexedDB Wrapper for persistng File/Blob objects
 */
const getDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const saveFileToIDB = async (key, file) => {
  if (!file || !(file instanceof File || file instanceof Blob)) return;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(file, key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('IDB Save Error:', err);
  }
};

export const saveFilesToIDB = async (filesMap) => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    Object.entries(filesMap).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        // Explicitly delete the IDB entry so stale files don't persist after removal
        store.delete(key);
      } else if (Array.isArray(value)) {
        store.put(value, key);
      } else if (value instanceof File || value instanceof Blob) {
        store.put(value, key);
      }
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('IDB Bulk Save Error:', err);
  }
};

export const getFileFromIDB = async (key) => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('IDB Get Error:', err);
    return null;
  }
};

export const clearIDB = async () => {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('IDB Clear Error:', err);
  }
};
