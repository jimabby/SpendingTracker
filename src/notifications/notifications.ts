import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, Transaction } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bill-reminders', {
      name: 'Bill Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleCardReminder(card: Card): Promise<void> {
  await cancelCardReminder(card.id);

  const parsedDay = Number((card.dueDate || '').split('-').pop());
  const day = Number.isFinite(parsedDay) && parsedDay >= 1 && parsedDay <= 31 ? parsedDay : 1;
  // Remind the day before; if due on the 1st, remind on the 28th (safe for all months).
  const reminderDay = day > 1 ? day - 1 : 28;

  await Notifications.scheduleNotificationAsync({
    identifier: `card-reminder-${card.id}`,
    content: {
      title: 'Payment Due Tomorrow',
      body: `${card.name} (**** ${card.lastFour}) payment is due tomorrow`,
      data: { cardId: card.id },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      repeats: true,
      day: reminderDay,
      hour: 9,
      minute: 0,
    },
  });
}

export async function cancelCardReminder(cardId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`card-reminder-${cardId}`);
  } catch {
    // Notification may not exist.
  }
}

// --- Budget notifications ---

const NOTIFIED_BUDGETS_KEY = 'notified_budgets';

async function loadNotifiedBudgets(): Promise<Set<string>> {
  try {
    const json = await AsyncStorage.getItem(NOTIFIED_BUDGETS_KEY);
    if (json) return new Set(JSON.parse(json));
  } catch {}
  return new Set();
}

async function saveNotifiedBudgets(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFIED_BUDGETS_KEY, JSON.stringify([...set]));
  } catch {}
}

export async function setupBudgetNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('budget-alerts', {
      name: 'Budget Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

export async function checkBudgetNotifications(
  transactions: Transaction[],
  budgets: Record<string, number>,
  currency: string,
  language?: string
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const notifiedBudgets = await loadNotifiedBudgets();
  let changed = false;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Clean up stale entries from previous months
  for (const key of notifiedBudgets) {
    if (!key.startsWith(monthKey)) {
      notifiedBudgets.delete(key);
      changed = true;
    }
  }

  // Sum expenses per category for current month
  const categorySpend: Record<string, number> = {};
  transactions
    .filter(tx => tx.type === 'expense' && tx.date.startsWith(monthKey))
    .forEach(tx => {
      categorySpend[tx.category] = (categorySpend[tx.category] || 0) + tx.amount;
    });

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);

  for (const [category, limit] of Object.entries(budgets)) {
    if (!limit || limit <= 0) continue;
    const spent = categorySpend[category] || 0;
    const pct = spent / limit;

    const key100 = `${monthKey}:${category}:100`;
    const key80 = `${monthKey}:${category}:80`;

    if (pct >= 1 && !notifiedBudgets.has(key100)) {
      notifiedBudgets.add(key100);
      changed = true;
      await Notifications.scheduleNotificationAsync({
        identifier: `budget-exceeded-${category}-${monthKey}`,
        content: {
          title: 'Budget Exceeded',
          body: `${category}: spent ${fmt(spent)} of ${fmt(limit)} budget`,
          data: { category },
          sound: 'default',
          ...(Platform.OS === 'android' ? { android: { channelId: 'budget-alerts' } } : {}),
        },
        trigger: null,
      });
    } else if (pct >= 0.8 && pct < 1 && !notifiedBudgets.has(key80)) {
      notifiedBudgets.add(key80);
      changed = true;
      await Notifications.scheduleNotificationAsync({
        identifier: `budget-warning-${category}-${monthKey}`,
        content: {
          title: 'Budget Warning',
          body: `${category}: ${Math.round(pct * 100)}% of ${fmt(limit)} budget used`,
          data: { category },
          sound: 'default',
          ...(Platform.OS === 'android' ? { android: { channelId: 'budget-alerts' } } : {}),
        },
        trigger: null,
      });
    }
  }

  if (changed) {
    await saveNotifiedBudgets(notifiedBudgets);
  }
}
