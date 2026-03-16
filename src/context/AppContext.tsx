import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AppState, AppAction, RecurringTransaction } from '../types';
import { loadState, saveState, defaultState } from '../storage/storage';
import { differenceInCalendarDays } from 'date-fns';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function processRecurring(
  recurringTransactions: RecurringTransaction[],
  dispatch: React.Dispatch<AppAction>
) {
  const now = new Date();
  recurringTransactions.forEach(r => {
    const last = new Date(r.lastAddedDate);
    let isDue = false;
    if (r.frequency === 'daily') {
      isDue = differenceInCalendarDays(now, last) >= 1;
    } else if (r.frequency === 'weekly') {
      isDue = differenceInCalendarDays(now, last) >= 7;
    } else if (r.frequency === 'monthly') {
      isDue = now.getMonth() !== last.getMonth() || now.getFullYear() !== last.getFullYear();
    }
    if (isDue) {
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: generateId(),
          amount: r.amount,
          type: r.type,
          category: r.category,
          note: r.note,
          date: now.toISOString(),
        },
      });
      dispatch({
        type: 'UPDATE_RECURRING_DATE',
        payload: { id: r.id, lastAddedDate: now.toISOString() },
      });
    }
  });
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(t =>
          t.id === action.payload.id ? action.payload : t
        ),
      };
    case 'ADD_CARD':
      return { ...state, cards: [...state.cards, action.payload] };
    case 'UPDATE_CARD':
      return { ...state, cards: state.cards.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CARD':
      return { ...state, cards: state.cards.filter(c => c.id !== action.payload) };
    case 'TOGGLE_CARD_REMINDER':
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.payload ? { ...c, reminderEnabled: !c.reminderEnabled } : c
        ),
      };
    case 'SET_CURRENCY':
      return { ...state, currency: action.payload };
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };
    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c !== action.payload) };
    case 'SET_AI_SETTINGS':
      return { ...state, aiProvider: action.payload.provider, aiKey: action.payload.apiKey };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SET_BUDGET':
      return { ...state, budgets: { ...state.budgets, [action.payload.category]: action.payload.amount } };
    case 'DELETE_BUDGET': {
      const { [action.payload]: _, ...rest } = state.budgets;
      return { ...state, budgets: rest };
    }
    case 'ADD_RECURRING':
      return { ...state, recurringTransactions: [...state.recurringTransactions, action.payload] };
    case 'DELETE_RECURRING':
      return { ...state, recurringTransactions: state.recurringTransactions.filter(r => r.id !== action.payload) };
    case 'UPDATE_RECURRING_DATE':
      return {
        ...state,
        recurringTransactions: state.recurringTransactions.map(r =>
          r.id === action.payload.id ? { ...r, lastAddedDate: action.payload.lastAddedDate } : r
        ),
      };
    case 'ADD_GOAL':
      return { ...state, goals: [...(state.goals || []), action.payload] };
    case 'DELETE_GOAL':
      return { ...state, goals: (state.goals || []).filter(g => g.id !== action.payload) };
    case 'UPDATE_GOAL':
      return { ...state, goals: (state.goals || []).map(g => g.id === action.payload.id ? action.payload : g) };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue>({
  state: defaultState,
  dispatch: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const hydrated = useRef(false);

  useEffect(() => {
    loadState().then(loaded => {
      dispatch({ type: 'LOAD_STATE', payload: loaded });
      hydrated.current = true;
      processRecurring(loaded.recurringTransactions, dispatch);
    });
  }, []);

  useEffect(() => {
    if (hydrated.current) saveState(state);
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
