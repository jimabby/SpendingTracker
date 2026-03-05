import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-chart-kit';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { CATEGORY_COLORS } from '../constants/categories';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;
const BAR_WIDTH = CHART_WIDTH - 32;

const chartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(108, 92, 231, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(99, 110, 114, ${opacity})`,
  barPercentage: 0.6,
  decimalPlaces: 0,
};

export default function HomeScreen() {
  const { state } = useApp();
  const t = useTranslation();
  const { transactions, currency, budgets } = state;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const thisMonth = transactions.filter(t =>
    isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
  );

  const totalIncome = thisMonth
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = thisMonth
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {};
    thisMonth
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        map[tx.category] = (map[tx.category] || 0) + tx.amount;
      });
    return map;
  }, [thisMonth]);

  const pieData = useMemo(() => {
    return Object.entries(categorySpend).map(([name, amount]) => ({
      name: name.length > 12 ? name.slice(0, 12) + '…' : name,
      population: amount,
      color: CATEGORY_COLORS[name] || '#B2BEC3',
      legendFontColor: '#636E72',
      legendFontSize: 11,
    }));
  }, [transactions]);

  const barData = useMemo(() => {
    const labels: string[] = [];
    const data: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const month = subMonths(now, i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const total = transactions
        .filter(
          t =>
            t.type === 'expense' &&
            isWithinInterval(new Date(t.date), { start, end })
        )
        .reduce((sum, t) => sum + t.amount, 0);
      labels.push(format(month, 'MMM'));
      data.push(total);
    }
    return { labels, datasets: [{ data }] };
  }, [transactions]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.header}>{t('overview')}</Text>
      <Text style={styles.month}>{format(now, 'MMMM yyyy')}</Text>

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
        <Text style={[styles.balanceAmount, { color: balance >= 0 ? '#00B894' : '#D63031' }]}>
          {fmt(balance)}
        </Text>
      </View>

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
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('monthlyExpenses')}</Text>
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
      </View>

      {Object.keys(budgets).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('budgetLimits')}</Text>
          {Object.entries(budgets).map(([cat, limit]) => {
            const spent = categorySpend[cat] || 0;
            const pct = limit > 0 ? spent / limit : 0;
            const barColor = pct >= 1 ? '#D63031' : pct >= 0.8 ? '#E17055' : '#6C5CE7';
            return (
              <View key={cat} style={styles.budgetRow}>
                <View style={styles.budgetLabelRow}>
                  <Text style={styles.budgetCat}>{cat}</Text>
                  <Text style={[styles.budgetAmt, { color: pct >= 1 ? '#D63031' : '#636E72' }]}>
                    {fmt(spent)} / {fmt(limit)}
                  </Text>
                </View>
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: Math.min(pct, 1) * BAR_WIDTH, backgroundColor: barColor }]} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, paddingBottom: 32 },
  header: { fontSize: 28, fontWeight: '700', color: '#2D3436' },
  month: { fontSize: 14, color: '#636E72', marginTop: 2, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  incomeCard: { backgroundColor: '#E8F8F3' },
  expenseCard: { backgroundColor: '#FFEAEA' },
  cardLabel: { fontSize: 12, color: '#636E72', marginBottom: 4 },
  cardAmount: { fontSize: 18, fontWeight: '700', color: '#2D3436' },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  balanceLabel: { fontSize: 13, color: '#636E72' },
  balanceAmount: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#2D3436', marginBottom: 12 },
  empty: { alignItems: 'center', marginTop: 32 },
  emptyText: { fontSize: 16, color: '#636E72', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#B2BEC3', marginTop: 4, textAlign: 'center' },
  budgetRow: { marginBottom: 14 },
  budgetLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetCat: { fontSize: 13, fontWeight: '600', color: '#2D3436' },
  budgetAmt: { fontSize: 12 },
  progressBg: { height: 8, backgroundColor: '#F0F0F5', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
