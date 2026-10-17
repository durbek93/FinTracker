import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  setDoc,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyASeO3yD_ojaGl6Acl9jxDD6aqYvg3tEic",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "myfinancetracker-9eb06.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "myfinancetracker-9eb06",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "myfinancetracker-9eb06.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "32464591720",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:32464591720:web:e9082c4ab9ca3157bbd4dd"
};

// Initialize Firebase with persistent offline cache (IndexedDB + multi-tab)
const app = initializeApp(firebaseConfig);

const createFirestoreDb = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    console.warn('Persistent Firestore cache unavailable, falling back to memory cache:', err);
    return getFirestore(app);
  }
};

export const db = createFirestoreDb();
export const auth = getAuth(app);

// Export collections and utils
export { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, updateDoc, setDoc, where, getDocs, writeBatch };
