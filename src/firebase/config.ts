// ─────────────────────────────────────────────────────────────────
// HOW TO SET UP FIREBASE:
// 1. Go to https://console.firebase.google.com
// 2. Click "Add project" and give it a name (e.g. "Pockyt")
// 3. Inside the project, click "Add app" → Web (</>)
// 4. Register the app and copy the config values below
// 5. In Firebase console → Build → Firestore Database → Create database (start in test mode)
// 6. In Firebase console → Build → Authentication → Get started → Anonymous → Enable
// ─────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const firebaseApp = initializeApp(firebaseConfig);

export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(firebaseApp);
