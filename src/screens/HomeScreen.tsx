import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { CATEGORY_COLORS } from '../constants/categories';
import { AppTheme } from '../constants/theme';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, subMonths } from 'date-fns';
import GoalsScreen from './GoalsScreen';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;
const BAR_WIDTH = CHART_WIDTH - 32;

export default function HomeScreen() {
  const { state } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const { transactions, currency, budgets, language } = state;
  const goals = state.goals || [];
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [goalsVisible, setGoalsVisible] = useState(false);
  const styles = useMemo(() => createStyles(theme, state.darkMode), [theme, state.darkMode]);

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const now = new Date();

  const chartConfig = useMemo(() => ({
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    color: (opacity = 1) => `rgba(91, 108, 255, ${opacity})`,
    labelColor: () => theme.colors.textMuted,
    barPercentage: 0.6,
    decimalPlaces: 0,
  }), [theme]);

  const thisMonth = useMemo(
    () =>
      transactions.filter(tx =>
        isWithinInterval(new Date(tx.date), { start: startOfMonth(now), end: endOfMonth(now) })
      ),
    [transactions]
  );

  const thisYear = useMemo(
    () =>
      transactions.filter(tx =>
        isWithinInterval(new Date(tx.date), { start: startOfYear(now), end: endOfYear(now) })
      ),
    [transactions]
  );

  const activePeriod = period === 'month' ? thisMonth : thisYear;

  const totalIncome = useMemo(
    () => activePeriod.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0),
    [activePeriod]
  );

  const totalExpense = useMemo(
    () => activePeriod.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0),
    [activePeriod]
  );

  const balance = totalIncome - totalExpense;

  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {};
    activePeriod
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      });
    return map;
  }, [activePeriod]);

  const categoryEntries = useMemo(
    () => Object.entries(categorySpend).sort(([, a], [, b]) => b - a),
    [categorySpend]
  );

  const pieData = useMemo(
    () =>
      categoryEntries.map(([name, amount]) => ({
        name: name.length > 12 ? name.slice(0, 12) + '…' : name,
        population: amount,
        color: CATEGORY_COLORS[name] || '#B2BEC3',
        legendFontColor: theme.colors.textMuted,
        legendFontSize: 11,
      })),
    [categoryEntries, theme]
  );

  const barData = useMemo(() => {
    const labels: string[] = [];
    const data: number[] = [];
    const count = period === 'year' ? 12 : 6;
    for (let i = count - 1; i >= 0; i--) {
      const month = subMonths(now, i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const total = transactions
        .filter(tx => tx.type === 'expense' && isWithinInterval(new Date(tx.date), { start, end }))
        .reduce((sum, tx) => sum + tx.amount, 0);
      labels.push(format(month, 'MMM'));
      data.push(total);
    }
    return { labels, datasets: [{ data: data.length > 0 ? data : [0] }] };
  }, [transactions, period]);

  const hasBarData = barData.datasets[0].data.some(v => v > 0);

  const drillTxs = useMemo(
    () =>
      drillCategory
        ? activePeriod
            .filter(tx => tx.category === drillCategory)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        : [],
    [drillCategory, activePeriod]
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.header}>{t('overview')}</Text>
            <Text style={styles.month}>
              {period === 'month' ? format(now, 'MMMM yyyy') : format(now, 'yyyy')}
            </Text>
          </View>
          <View style={styles.periodToggle}>
            {(['month', 'year'] as const).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                  {t(p === 'month' ? 'thisMonth' : 'thisYear')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.card, styles.incomeCard]}>
            <Text style={styles.cardLabel}>{t('income')}</Text>
            <Text style={styles.cardAmount}>{fmt(totalIncome)}</Text>
          </View>
          <View style={[styles.card, styles.expenseCard]}>
            <Text style={styles.cardLabel}>{t('expenses')}</Text>
            <Text style={styles.cardAmount}>{fmt(totalExpense)}</Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('netBalance')}</Text>
          <Text style={[styles.balanceAmount, { color: balance >= 0 ? theme.colors.success : theme.colors.danger }]}>
            {fmt(balance)}
          </Text>
        </View>

        {/* Goals summary card */}
        <TouchableOpacity style={styles.goalsCard} onPress={() => setGoalsVisible(true)} activeOpacity={0.85}>
          <View style={styles.goalsCardLeft}>
            <View style={styles.goalsIconWrap}>
              <Ionicons name="trophy" size={20} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.goalsCardTitle}>{t('savingsGoals')}</Text>
              <Text style={styles.goalsCardSub}>
                {goals.length === 0
                  ? t('tapToSetFirstGoal')
                  : t('goalsCompleted')(goals.filter(g => g.savedAmount >= g.targetAmount).length, goals.length)}
              </Text>
            </View>
          </View>
          <View style={styles.goalsCardRight}>
            {goals.length > 0 && (
              <Text style={styles.goalsCardPct}>
                {Math.round(
                  (goals.reduce((s, g) => s + g.savedAmount, 0) /
                    Math.max(1, goals.reduce((s, g) => s + g.targetAmount, 0))) * 100
                )}%
              </Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} />
          </View>
        </TouchableOpacity>

        {pieData.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('spendingByCategory')}</Text>
            <PieChart
              data={pieData}
              width={CHART_WIDTH}
              height={180}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="0"
              absolute={false}
              hasLegend={false}
            />
            {categoryEntries.map(([cat, amount]) => (
              <TouchableOpacity
                key={cat}
                style={styles.catRow}
                onPress={() => setDrillCategory(cat)}
              >
                <View style={[styles.catDot, { backgroundColor: CATEGORY_COLORS[cat] || '#B2BEC3' }]} />
                <Text style={styles.catName}>{cat}</Text>
                <Text style={styles.catAmt}>{fmt(amount)}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textFaint} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {period === 'year' ? t('annualExpenses') : t('monthlyExpenses')}
          </Text>
          {hasBarData ? (
            <BarChart
              data={barData}
              width={CHART_WIDTH}
              height={180}
              chartConfig={chartConfig}
              style={{ borderRadius: 12, marginLeft: -16 }}
              showValuesOnTopOfBars={false}
              fromZero
              yAxisLabel=""
              yAxisSuffix=""
            />
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={40} color={theme.colors.textFaint} />
              <Text style={styles.chartEmptyText}>{t('noExpenseData')}</Text>
            </View>
          )}
        </View>

        {period === 'month' && Object.keys(budgets).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('budgetLimits')}</Text>
            {Object.entries(budgets).map(([cat, limit]) => {
              const spent = categorySpend[cat] || 0;
              const pct = limit > 0 ? spent / limit : 0;
              const barColor = pct >= 1 ? theme.colors.danger : pct >= 0.8 ? theme.colors.warning : theme.colors.primary;
              return (
                <View key={cat} style={styles.budgetRow}>
                  <View style={styles.budgetLabelRow}>
                    <Text style={styles.budgetCat}>{cat}</Text>
                    <Text style={[styles.budgetAmt, { color: pct >= 1 ? theme.colors.danger : theme.colors.textMuted }]}>
                      {fmt(spent)} / {fmt(limit)}
                    </Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: Math.min(pct, 1) * BAR_WIDTH, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {transactions.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('noTransactionsYet')}</Text>
            <Text style={styles.emptyHint}>{t('addFirstTransaction')}</Text>
          </View>
        )}
      </ScrollView>

      <GoalsScreen visible={goalsVisible} onClose={() => setGoalsVisible(false)} />

      {/* Category drill-down modal */}
      <Modal
        visible={drillCategory !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDrillCategory(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={[
                    styles.catDot,
                    { backgroundColor: CATEGORY_COLORS[drillCategory || ''] || '#B2BEC3' },
                  ]}
                />
                <Text style={styles.modalTitle}>{drillCategory}</Text>
              </View>
              <TouchableOpacity onPress={() => setDrillCategory(null)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.drillTotal}>
              {fmt(drillCategory ? categorySpend[drillCategory] || 0 : 0)}
            </Text>
            <FlatList
              data={drillTxs}
              keyExtractor={item => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <View style={styles.drillRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drillNote}>{item.note || item.category}</Text>
                    <Text style={styles.drillDate}>{format(new Date(item.date), 'MMM d, yyyy')}</Text>
                  </View>
                  <Text
                    style={[
                      styles.drillAmt,
                      { color: item.type === 'income' ? theme.colors.success : theme.colors.danger },
                    ]}
                  >
                    {item.type === 'income' ? '+' : '-'}
                    {fmt(item.amount)}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.drillEmpty}>{t('noTransactions')}</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme, darkMode: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 32 },
    header: { fontSize: 28, fontWeight: '800', color: theme.colors.text },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    month: { fontSize: 14, color: theme.colors.textMuted, marginTop: 2 },
    periodToggle: {
      flexDirection: 'row',
      gap: 4,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 20,
      padding: 4,
      alignSelf: 'flex-start',
      marginTop: 6,
    },
    periodBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
    periodBtnActive: { backgroundColor: theme.colors.primary },
    periodBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
    periodBtnTextActive: { color: '#fff' },
    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    card: {
      flex: 1,
      borderRadius: theme.radius.lg,
      padding: 16,
      ...theme.shadow.card,
    },
    incomeCard: { backgroundColor: darkMode ? '#0D3326' : '#E8F8F3' },
    expenseCard: { backgroundColor: darkMode ? '#3D1515' : '#FFEAEA' },
    cardLabel: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
    cardAmount: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    goalsCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: 16,
      marginBottom: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...theme.shadow.card,
    },
    goalsCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    goalsIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.colors.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalsCardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    goalsCardSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
    goalsCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    goalsCardPct: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
    balanceCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: 16,
      marginBottom: 12,
      alignItems: 'center',
      ...theme.shadow.card,
    },
    balanceLabel: { fontSize: 13, color: theme.colors.textMuted },
    balanceAmount: { fontSize: 32, fontWeight: '700', marginTop: 4 },
    section: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: 16,
      marginBottom: 16,
      ...theme.shadow.card,
      overflow: 'hidden',
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: 8,
    },
    catDot: { width: 10, height: 10, borderRadius: 5 },
    catName: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '500' },
    catAmt: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
    empty: { alignItems: 'center', marginTop: 32 },
    emptyText: { fontSize: 16, color: theme.colors.textMuted, fontWeight: '500' },
    emptyHint: { fontSize: 13, color: theme.colors.textFaint, marginTop: 4, textAlign: 'center' },
    chartEmpty: { alignItems: 'center', paddingVertical: 32 },
    chartEmptyText: { fontSize: 13, color: theme.colors.textFaint, marginTop: 8 },
    budgetRow: { marginBottom: 14 },
    budgetLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    budgetCat: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
    budgetAmt: { fontSize: 12 },
    progressBg: { height: 8, backgroundColor: theme.colors.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    drillTotal: { fontSize: 28, fontWeight: '700', color: theme.colors.danger, marginBottom: 16 },
    drillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    drillNote: { fontSize: 14, color: theme.colors.text, fontWeight: '500' },
    drillDate: { fontSize: 12, color: theme.colors.textFaint, marginTop: 2 },
    drillAmt: { fontSize: 15, fontWeight: '700' },
    drillEmpty: { textAlign: 'center', color: theme.colors.textFaint, paddingVertical: 24 },
  });
}

