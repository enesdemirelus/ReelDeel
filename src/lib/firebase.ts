import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence: (
      storage: unknown,
    ) => firebaseAuth.Persistence;
  }
).getReactNativePersistence;

function resolveAuth(): firebaseAuth.Auth {
  try {
    return firebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return firebaseAuth.getAuth(app);
  }
}

export const auth = resolveAuth();
export const db = getFirestore(app);

let authPromise: Promise<string> | null = null;

export function ensureAuth(): Promise<string> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (authPromise) return authPromise;

  authPromise = new Promise<string>((resolve, reject) => {
    const unsub = firebaseAuth.onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user.uid);
      }
    });
    firebaseAuth.signInAnonymously(auth).catch((error) => {
      unsub();
      authPromise = null;
      reject(error);
    });
  });

  return authPromise;
}
