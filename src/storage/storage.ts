import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from '../types';
import { DEFAULT_CATEGORIES } from '../constants/categories';

const STORAGE_KEY = 'spending_tracker_state';

export const defaultState: AppState = {
  transactions: [],
  cards: [],
  currency: 'USD',
  categories: DEFAULT_CATEGORIES,
  aiProvider: 'chatgpt',
  aiKey: '',
  language: 'en',
  budgets: {},
  recurringTransactions: [],
  goals: [],
  darkMode: false,
};

export async function loadState(): Promise<AppState> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      return { ...defaultState, ...JSON.parse(json) };
    }
  } catch (e) {
    if (__DEV__) console.error('Failed to load state', e);
  }
  return defaultState;
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    if (__DEV__) console.error('Failed to save state', e);
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    if (__DEV__) console.error('Failed to clear state', e);
  }
}

export async function exportState(): Promise<string> {
  const json = await AsyncStorage.getItem(STORAGE_KEY);
  return json || JSON.stringify(defaultState);
}

export async function importState(json: string): Promise<AppState> {
  const parsed = JSON.parse(json);
  const merged = { ...defaultState, ...parsed };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

// Receipt photos persistence
const PHOTOS_KEY = 'receipt_photos';

export async function loadPhotos(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(PHOTOS_KEY);
    if (json) return JSON.parse(json);
  } catch {}
  return [];
}

export async function savePhotos(photos: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
  } catch {}
}
