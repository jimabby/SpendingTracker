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
};

export async function loadState(): Promise<AppState> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      return { ...defaultState, ...JSON.parse(json) };
    }
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return defaultState;
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear state', e);
  }
}
