import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system/next';
import * as MailComposer from 'expo-mail-composer';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { sendAIMessageWithTools, ChatMessage, AIProvider } from '../utils/ai';
import { TOOL_DEFINITIONS, executeToolCall } from '../utils/aiTools';
import { translations } from '../i18n/translations';
import { AppTheme } from '../constants/theme';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
} from 'date-fns';

const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
}

// ── Analytics helpers ──────────────────────────────────────────────────────────

function monthExpenses(transactions: ReturnType<typeof useApp>['state']['transactions'], offset: number) {
  const now = new Date();
  const ref = subMonths(now, offset);
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return transactions
    .filter(t => t.type === 'expense' && isWithinInterval(new Date(t.date), { start, end }))
    .reduce((s, t) => s + t.amount, 0);
}

function monthIncome(transactions: ReturnType<typeof useApp>['state']['transactions'], offset: number) {
  const now = new Date();
  const ref = subMonths(now, offset);
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return transactions
    .filter(t => t.type === 'income' && isWithinInterval(new Date(t.date), { start, end }))
    .reduce((s, t) => s + t.amount, 0);
}

function categoryAverages(
  transactions: ReturnType<typeof useApp>['state']['transactions'],
  months: number
): Record<string, number> {
  const now = new Date();
  const start = startOfMonth(subMonths(now, months - 1));
  const end = endOfMonth(now);
  const relevant = transactions.filter(
    t => t.type === 'expense' && isWithinInterval(new Date(t.date), { start, end })
  );
  const catTotals: Record<string, number> = {};
  relevant.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const result: Record<string, number> = {};
  Object.entries(catTotals).forEach(([cat, total]) => { result[cat] = total / months; });
  return result;
}

function detectAnomalies(
  transactions: ReturnType<typeof useApp>['state']['transactions'],
  avgs: Record<string, number>,
  currency: string
): string[] {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const anomalies: string[] = [];
  transactions
    .filter(t => t.type === 'expense' && new Date(t.date) >= cutoff)
    .forEach(t => {
      const avg = avgs[t.category];
      if (avg && t.amount > avg * 2.5 && t.amount > 20) {
        anomalies.push(
          `${t.date.slice(0, 10)} | ${t.category} | ${t.amount.toFixed(2)} ${currency} (${Math.round(t.amount / avg)}x avg)`
        );
      }
    });
  return anomalies.slice(0, 5);
}

function computeHealthScore(
  totalIncome: number,
  totalExpense: number,
  budgets: Record<string, number>,
  categorySpend: Record<string, number>
): { score: number; breakdown: string } {
  let score = 0;
  const parts: string[] = [];

  if (totalIncome > 0) {
    const savingsRate = Math.max(0, (totalIncome - totalExpense) / totalIncome);
    const savingsPts = Math.min(40, Math.round(savingsRate * 100));
    score += savingsPts;
    parts.push(`Savings ${savingsPts}/40`);
  } else {
    parts.push('Savings 0/40 (no income recorded)');
  }

  const budgetCats = Object.keys(budgets);
  if (budgetCats.length > 0) {
    const within = budgetCats.filter(c => (categorySpend[c] || 0) <= budgets[c]).length;
    const budgetPts = Math.round((within / budgetCats.length) * 30);
    score += budgetPts;
    parts.push(`Budget ${budgetPts}/30`);
  } else {
    score += 15;
    parts.push('Budget 15/30 (no budgets set)');
  }

  const numCategories = Object.keys(categorySpend).length;
  const varietyPts = Math.min(20, numCategories * 3);
  score += varietyPts;
  parts.push(`Variety ${varietyPts}/20`);

  if (totalIncome > 0 && totalExpense < totalIncome * 0.7) {
    score += 10;
    parts.push('Low spending 10/10');
  } else if (totalIncome > 0 && totalExpense < totalIncome) {
    score += 5;
    parts.push('Moderate spending 5/10');
  } else {
    parts.push('High spending 0/10');
  }

  return { score: Math.min(100, score), breakdown: parts.join(' | ') };
}

function userPersonality(
  transactions: ReturnType<typeof useApp>['state']['transactions'],
  months: number
): string {
  let totalSaved = 0;
  let totalSpent = 0;
  for (let i = 0; i < months; i++) {
    totalSaved += monthIncome(transactions, i);
    totalSpent += monthExpenses(transactions, i);
  }
  if (totalSaved === 0 && totalSpent === 0) return 'Unknown (not enough data)';
  const rate = totalSaved > 0 ? (totalSaved - totalSpent) / totalSaved : -1;
  if (rate > 0.3) return 'Saver (saves 30%+ of income consistently)';
  if (rate > 0.1) return 'Balanced (saves 10-30% of income)';
  if (rate > 0) return 'Tight (saves under 10% of income)';
  return 'Overspender (expenses exceed income)';
}

function buildContext(state: ReturnType<typeof useApp>['state']): string {
  const { transactions, cards, currency, budgets, goals } = state;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const thisMonth = transactions.filter(t =>
    isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
  );
  const totalIncome = thisMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = thisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const lastMonth = transactions.filter(t =>
    isWithinInterval(new Date(t.date), { start: lastMonthStart, end: lastMonthEnd })
  );
  const lastMonthExpense = lastMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const lastMonthIncome = lastMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const expenseChange = lastMonthExpense > 0
    ? ((totalExpense - lastMonthExpense) / lastMonthExpense * 100).toFixed(1)
    : 'N/A';
  const incomeChange = lastMonthIncome > 0
    ? ((totalIncome - lastMonthIncome) / lastMonthIncome * 100).toFixed(1)
    : 'N/A';

  const categorySpend: Record<string, number> = {};
  thisMonth.filter(t => t.type === 'expense').forEach(t => {
    categorySpend[t.category] = (categorySpend[t.category] || 0) + t.amount;
  });
  const topCategories = Object.entries(categorySpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([cat, amount]) => {
      const budget = budgets[cat];
      const budgetStr = budget ? ` / budget ${budget.toFixed(2)}` : '';
      return `${cat}: ${amount.toFixed(2)} ${currency}${budgetStr}`;
    })
    .join(', ') || 'No expenses yet';

  const avgs6m = categoryAverages(transactions, 6);
  const avgsList = Object.entries(avgs6m)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([cat, avg]) => `${cat}: ${avg.toFixed(2)} ${currency}/month`)
    .join(', ') || 'Not enough history';

  const anomalies = detectAnomalies(transactions, avgs6m, currency);
  const anomalySection = anomalies.length > 0
    ? `POTENTIAL ANOMALIES (unusually large transactions, last 30 days):\n${anomalies.join('\n')}`
    : 'No anomalies detected in the last 30 days.';

  const m1 = monthExpenses(transactions, 1);
  const m2 = monthExpenses(transactions, 2);
  const m3 = monthExpenses(transactions, 3);
  const validMonths = [m1, m2, m3].filter(v => v > 0);
  const forecast = validMonths.length > 0
    ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length).toFixed(2)
    : 'Insufficient data';

  const { score: healthScore, breakdown: healthBreakdown } = computeHealthScore(
    totalIncome, totalExpense, budgets, categorySpend
  );
  const healthLabel = healthScore >= 75 ? 'Excellent' : healthScore >= 55 ? 'Good' : healthScore >= 35 ? 'Fair' : 'Needs Work';

  const personality = userPersonality(transactions, 6);

  const budgetKeys = Object.keys(budgets);
  const budgetSection = budgetKeys.length > 0
    ? budgetKeys.map(cat => {
        const spent = categorySpend[cat] || 0;
        const limit = budgets[cat];
        const pct = Math.round((spent / limit) * 100);
        const status = spent > limit ? 'OVER BUDGET' : pct >= 80 ? 'near limit' : 'ok';
        return `${cat}: ${spent.toFixed(2)}/${limit.toFixed(2)} ${currency} (${pct}% - ${status})`;
      }).join('\n')
    : 'No budgets set';

  const txList = transactions.slice(0, 30).map(t =>
    `[id:${t.id}] ${t.date.slice(0, 10)} | ${t.type} | ${t.amount.toFixed(2)} ${currency} | ${t.category}${t.note ? ' | ' + t.note : ''}`
  ).join('\n') || 'No transactions yet';

  const cardList = cards.map(c =>
    `[id:${c.id}] ${c.name} | ···· ${c.lastFour} | due: ${c.dueDate}${c.benefits ? ' | benefits: ' + c.benefits : ''}${c.annualFee ? ' | annual fee: ' + c.annualFee : ''}`
  ).join('\n') || 'No cards';

  const goalsList = (goals || []).length > 0
    ? (goals || []).map(g => {
        const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
        const deadlineStr = g.deadline ? ` | deadline: ${g.deadline}` : '';
        const remaining = (g.targetAmount - g.savedAmount).toFixed(2);
        return `[id:${g.id}] "${g.title}" — saved: ${g.savedAmount}/${g.targetAmount} ${currency} (${pct}%)${deadlineStr} | still need: ${remaining} ${currency}`;
      }).join('\n')
    : 'No goals set yet. Use set_goal tool to create one.';

  const lang = (state.language === 'zh' ? 'zh' : 'en') as 'en' | 'zh';
  const langInstruction = translations[lang].aiLanguageInstruction;

  return `You are Pockyt AI, an expert financial coach and assistant built into the Pockyt spending tracker app. You have deep access to the user's financial data and can:
- Give personalized financial insights and advice
- Detect spending patterns and anomalies
- Suggest smart budgets based on history
- Provide financial health assessments
- Help set and track savings goals
- Recommend which credit card to use for different spending categories
- Give monthly AI summary reports
- Forecast next month's spending
- Identify unusual transactions that might be errors or fraud
- Provide personality-based financial coaching (saver vs spender style)
- Perform actions: add/delete transactions and cards, set goals, change language, send CSV export

Always be specific, data-driven, and actionable. Reference actual numbers from the user's data. ${langInstruction}

━━━ FINANCIAL SNAPSHOT ━━━
Current month: ${format(now, 'MMMM yyyy')}
Currency: ${currency}

This month income: ${totalIncome.toFixed(2)} ${currency} (${incomeChange !== 'N/A' ? (parseFloat(incomeChange) >= 0 ? '+' : '') + incomeChange + '% vs last month' : 'no prior data'})
This month expenses: ${totalExpense.toFixed(2)} ${currency} (${expenseChange !== 'N/A' ? (parseFloat(expenseChange) >= 0 ? '+' : '') + expenseChange + '% vs last month' : 'no prior data'})
Net balance: ${(totalIncome - totalExpense).toFixed(2)} ${currency}
Last month expenses: ${lastMonthExpense.toFixed(2)} ${currency}
Last month income: ${lastMonthIncome.toFixed(2)} ${currency}

━━━ FINANCIAL HEALTH SCORE ━━━
Score: ${healthScore}/100 (${healthLabel})
Breakdown: ${healthBreakdown}
User profile: ${personality}

━━━ SPENDING BY CATEGORY (this month) ━━━
${topCategories}

━━━ BUDGET STATUS ━━━
${budgetSection}

━━━ 6-MONTH SPENDING AVERAGES ━━━
${avgsList}

━━━ ANOMALY DETECTION ━━━
${anomalySection}

━━━ PREDICTIVE FORECAST ━━━
Estimated next month spending: ${forecast} ${currency} (based on last 3 months average)

━━━ GOALS ━━━
${goalsList}

━━━ CARDS ━━━
${cardList}

━━━ RECENT TRANSACTIONS (use IDs for delete_transaction) ━━━
Total in history: ${transactions.length}
${txList}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const INSIGHT_CHIPS = [
  { icon: 'analytics-outline' as const, labelKey: 'insightChipHealth' },
  { icon: 'trending-up-outline' as const, labelKey: 'insightChipPattern' },
  { icon: 'wallet-outline' as const, labelKey: 'insightChipBudget' },
  { icon: 'alert-circle-outline' as const, labelKey: 'insightChipAnomaly' },
  { icon: 'card-outline' as const, labelKey: 'insightChipCard' },
  { icon: 'flag-outline' as const, labelKey: 'insightChipGoal' },
  { icon: 'calendar-outline' as const, labelKey: 'insightChipForecast' },
  { icon: 'document-text-outline' as const, labelKey: 'insightChipSummary' },
];

function createStyles(theme: AppTheme, darkMode: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
    headerSub: { fontSize: 12, color: theme.colors.textFaint, marginTop: 1 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: darkMode ? theme.colors.surfaceMuted : '#F0F0F5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: darkMode ? '#3D2020' : '#FFF3F0',
      padding: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: darkMode ? '#5A2D2D' : '#FEDDDD',
    },
    warningText: { flex: 1, fontSize: 13, color: darkMode ? '#F87171' : '#E17055' },
    messages: { flex: 1 },
    messagesContent: { padding: 16, paddingBottom: 8 },
    welcomeContainer: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4 },
    welcomeAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: darkMode ? '#2D2A4A' : '#EEE9FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    welcomeTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
    welcomeText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
    insightSectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textFaint,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      alignSelf: 'flex-start',
      marginBottom: 8,
      marginTop: 4,
    },
    insightGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      width: '100%',
      marginBottom: 16,
    },
    insightChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: darkMode ? '#2D2A4A' : '#EEE9FF',
      borderRadius: 20,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    insightChipText: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },
    quickQuestions: { width: '100%', gap: 8 },
    quickChip: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      paddingHorizontal: 14,
    },
    quickChipText: { fontSize: 14, color: theme.colors.text },
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
    msgRowUser: { justifyContent: 'flex-end' },
    msgRowAI: { justifyContent: 'flex-start' },
    msgAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: darkMode ? '#2D2A4A' : '#EEE9FF',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    msgBubble: { maxWidth: '78%', borderRadius: 18, padding: 12, paddingHorizontal: 14 },
    msgBubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
    msgBubbleAI: {
      backgroundColor: theme.colors.surface,
      borderBottomLeftRadius: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: darkMode ? 0.2 : 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    msgText: { fontSize: 15, lineHeight: 21 },
    msgTextUser: { color: '#fff' },
    msgTextAI: { color: theme.colors.text },
    actionsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 2, marginBottom: 4 },
    actionsAvatarSpacer: { width: 28, flexShrink: 0 },
    actionsBubble: {
      backgroundColor: darkMode ? '#1A2E1A' : '#EAFFEA',
      borderWidth: 1,
      borderColor: darkMode ? '#2D4A2D' : '#B2DFDB',
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 4,
      maxWidth: '78%',
    },
    actionLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionText: { fontSize: 13, color: theme.colors.success, flex: 1 },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 10,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
      maxHeight: 100,
    },
    sendBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: darkMode ? '#3E4250' : '#B2BEC3' },
  });
}

export default function AIScreen({ visible, onClose }: Props) {
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, state.darkMode), [theme, state.darkMode]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const provider = (state.aiProvider || 'chatgpt') as AIProvider;
  const apiKey = state.aiKey || '';

  async function handleSendEmail(email: string): Promise<void> {
    const { transactions } = state;
    const header = 'Date,Type,Category,Amount,Note\n';
    const rows = transactions.map(tx => {
      const date = format(new Date(tx.date), 'yyyy-MM-dd');
      const note = (tx.note || '').replace(/"/g, '""');
      return `${date},${tx.type},${tx.category},${tx.amount},"${note}"`;
    }).join('\n');
    const csv = header + rows;

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      const subject = encodeURIComponent('Pockyt Transactions Export');
      const body = encodeURIComponent(csv);
      await Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
      return;
    }

    try {
      const fileName = `pockyt_export_${format(new Date(), 'yyyyMMdd')}.csv`;
      const file = new File(Paths.document + fileName);
      await file.write(csv);
      await MailComposer.composeAsync({
        recipients: [email],
        subject: 'Pockyt Transactions Export',
        body: 'Please find your Pockyt transaction history attached.',
        attachments: [file.uri],
      });
    } catch {
      await MailComposer.composeAsync({
        recipients: [email],
        subject: 'Pockyt Transactions Export',
        body: csv,
      });
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: DisplayMessage = { role: 'user', content: text.trim() };
    const displayHistory = [...messages, userMsg];
    setMessages(displayHistory);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const apiMessages: ChatMessage[] = displayHistory.map(m => ({ role: m.role, content: m.content }));
    const collectedActions: string[] = [];

    try {
      const systemPrompt = buildContext(state);
      const reply = await sendAIMessageWithTools(
        provider,
        apiKey,
        apiMessages,
        systemPrompt,
        TOOL_DEFINITIONS,
        async (name, args) => {
          const result = await executeToolCall(name, args, dispatch, state, handleSendEmail);
          collectedActions.push(result.summary);
          return result.ok ? `Success: ${result.summary}` : `Failed: ${result.summary}`;
        }
      );

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: reply,
        actions: collectedActions.length > 0 ? collectedActions : undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message || t('aiError'));
    } finally {
      setLoading(false);
    }
  }

  const quickPrompts: Record<string, string> = {
    insightChipHealth: t('insightPromptHealth'),
    insightChipPattern: t('insightPromptPattern'),
    insightChipBudget: t('insightPromptBudget'),
    insightChipAnomaly: t('insightPromptAnomaly'),
    insightChipCard: t('insightPromptCard'),
    insightChipGoal: t('insightPromptGoal'),
    insightChipForecast: t('insightPromptForecast'),
    insightChipSummary: t('insightPromptSummary'),
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Pockyt AI</Text>
              <Text style={styles.headerSub}>{PROVIDER_LABELS[provider]} · {t('yourFinancialAssistant')}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {!apiKey && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={state.darkMode ? '#F87171' : '#E17055'} />
            <Text style={styles.warningText}>{t('addApiKeyHint')}</Text>
          </View>
        )}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={styles.welcomeContainer}>
                <View style={styles.welcomeAvatar}>
                  <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
                </View>
                <Text style={styles.welcomeTitle}>{t('hiImPockyt')}</Text>
                <Text style={styles.welcomeText}>{t('welcomeText')}</Text>

                <Text style={styles.insightSectionTitle}>{t('insightSectionTitle')}</Text>
                <View style={styles.insightGrid}>
                  {INSIGHT_CHIPS.map(chip => (
                    <TouchableOpacity
                      key={chip.labelKey}
                      style={styles.insightChip}
                      onPress={() => sendMessage(quickPrompts[chip.labelKey])}
                    >
                      <Ionicons name={chip.icon} size={18} color={theme.colors.primary} />
                      <Text style={styles.insightChipText}>{t(chip.labelKey as any)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.insightSectionTitle}>{t('quickQSectionTitle')}</Text>
                <View style={styles.quickQuestions}>
                  {([t('quickQ1'), t('quickQ2'), t('quickQ3'), t('quickQ4')] as string[]).map(q => (
                    <TouchableOpacity key={q} style={styles.quickChip} onPress={() => sendMessage(q)}>
                      <Text style={styles.quickChipText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {messages.map((msg, i) => (
              <View key={i}>
                <View style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowAI]}>
                  {msg.role === 'assistant' && (
                    <View style={styles.msgAvatar}>
                      <Ionicons name="sparkles" size={13} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={[styles.msgBubble, msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAI]}>
                    <Text style={[styles.msgText, msg.role === 'user' ? styles.msgTextUser : styles.msgTextAI]}>
                      {msg.content}
                    </Text>
                  </View>
                </View>

                {msg.actions && msg.actions.length > 0 && (
                  <View style={styles.actionsRow}>
                    <View style={styles.actionsAvatarSpacer} />
                    <View style={styles.actionsBubble}>
                      {msg.actions.map((action, j) => (
                        <View key={j} style={styles.actionLine}>
                          <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                          <Text style={styles.actionText}>{action}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))}

            {loading && (
              <View style={[styles.msgRow, styles.msgRowAI]}>
                <View style={styles.msgAvatar}>
                  <Ionicons name="sparkles" size={13} color={theme.colors.primary} />
                </View>
                <View style={[styles.msgBubble, styles.msgBubbleAI, { paddingHorizontal: 20 }]}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={t('askAnything')}
              placeholderTextColor={theme.colors.textFaint}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
