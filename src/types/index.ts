export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  note: string;
  date: string; // ISO date string
  receiptUri?: string;
}

export interface Card {
  id: string;
  name: string;
  lastFour: string;
  dueDate: number; // day of month 1-31
  benefits: string;
  color: string;
}

export interface AppState {
  transactions: Transaction[];
  cards: Card[];
  currency: string;
  categories: string[];
}

export type AppAction =
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'SET_CURRENCY'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: string }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'LOAD_STATE'; payload: AppState };
