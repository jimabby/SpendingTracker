import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './config';
import { AppState } from '../types';

async function ensureAuth(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const result = await signInAnonymously(auth);
  return result.user.uid;
}

export async function loadFromCloud(): Promise<AppState | null> {
  const uid = await ensureAuth();
  const snap = await getDoc(doc(db, 'users', uid, 'data', 'state'));
  if (snap.exists()) return snap.data() as AppState;
  return null;
}

export async function saveToCloud(state: AppState): Promise<void> {
  const uid = await ensureAuth();
  await setDoc(doc(db, 'users', uid, 'data', 'state'), state);
}
