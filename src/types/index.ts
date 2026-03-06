export type TransactionType = 'expense' | 'income';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  note: string;
  date: string; // ISO date string
  receiptUri?: string;
  cardId?: string;
}

export interface Card {
  id: string;
  name: string;
  lastFour: string;
  dueDate: string; // day of month e.g. "15" = due on the 15th every month
  benefits: string;
  color: string;
  reminderEnabled?: boolean;
  annualFee?: number;       // e.g. 95
  anniversaryDate?: string; // "M-D" format e.g. "3-15" = March 15
  bankDomain?: string;      // clearbit domain e.g. "chase.com", absent = no logo
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export interface RecurringTransaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  note: string;
  frequency: RecurringFrequency;
  lastAddedDate: string; // ISO string
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
  deadline?: string; // ISO date string
  color?: string;
  icon?: string;
}

export interface AppState {
  transactions: Transaction[];
  cards: Card[];
  currency: string;
  categories: string[];
  aiProvider: string;
  aiKey: string;
  language: string;
  budgets: Record<string, number>;
  recurringTransactions: RecurringTransaction[];
  goals: Goal[];
}

export type AppAction =
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'UPDATE_CARD'; payload: Card }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'TOGGLE_CARD_REMINDER'; payload: string }
  | { type: 'SET_CURRENCY'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: string }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'SET_AI_SETTINGS'; payload: { provider: string; apiKey: string } }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_BUDGET'; payload: { category: string; amount: number } }
  | { type: 'DELETE_BUDGET'; payload: string }
  | { type: 'ADD_RECURRING'; payload: RecurringTransaction }
  | { type: 'DELETE_RECURRING'; payload: string }
  | { type: 'UPDATE_RECURRING_DATE'; payload: { id: string; lastAddedDate: string } }
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'UPDATE_GOAL'; payload: Goal }
  | { type: 'LOAD_STATE'; payload: AppState };
