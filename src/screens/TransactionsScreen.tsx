import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { Transaction, RecurringFrequency, Card } from '../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../constants/categories';
import { AppTheme } from '../constants/theme';
import { format } from 'date-fns';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function TransactionItem({
  item,
  currency,
  locale,
  cards,
  theme,
  styles,
  onDelete,
  onEdit,
}: {
  item: Transaction;
  currency: string;
  locale: string;
  cards: Card[];
  theme: AppTheme;
  styles: any;
  onDelete: (id: string) => void;
  onEdit: (item: Transaction) => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  const linkedCard = item.cardId ? cards.find(c => c.id === item.cardId) : undefined;

  return (
    <View style={styles.item}>
      <View style={[styles.iconBg, { backgroundColor: CATEGORY_COLORS[item.category] + '22' }]}>
        <Ionicons
          name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
          size={20}
          color={CATEGORY_COLORS[item.category] || theme.colors.textMuted}
        />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemCategory}>{item.category}</Text>
        <Text style={styles.itemNote} numberOfLines={1}>{item.note || format(new Date(item.date), 'MMM d, yyyy')}</Text>
        <View style={styles.itemMeta}>
          {item.note ? <Text style={styles.itemDate}>{format(new Date(item.date), 'MMM d, yyyy')}</Text> : null}
          {linkedCard && (
            <View style={[styles.cardBadge, { backgroundColor: linkedCard.color + '22' }]}>
              <Ionicons name="card-outline" size={10} color={linkedCard.color} />
              <Text style={[styles.cardBadgeText, { color: linkedCard.color }]}>{linkedCard.name}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.itemAmount, { color: item.type === 'income' ? theme.colors.success : theme.colors.danger }]}>
        {item.type === 'income' ? '+' : '-'}{fmt(item.amount)}
      </Text>
      <TouchableOpacity onPress={() => onEdit(item)} style={styles.editBtn}>
        <Ionicons name="pencil-outline" size={16} color={theme.colors.textFaint} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={theme.colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}

const FREQ_OPTIONS: RecurringFrequency[] = ['daily', 'weekly', 'monthly'];

export default function TransactionsScreen() {
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const { transactions, currency, categories, cards, language } = state;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [cardId, setCardId] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');

  const filtered = useMemo(() => {
    let result = transactions;
    if (filterMonth) {
      result = result.filter(tx => tx.date.startsWith(filterMonth));
    }
    if (filterCategory) {
      result = result.filter(tx => tx.category === filterCategory);
    }
    if (filterType !== 'all') {
      result = result.filter(tx => tx.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        tx =>
          tx.note.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          tx.amount.toString().includes(q)
      );
    }
    return result.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterMonth, filterCategory, filterType, searchQuery]);

  function resetForm() {
    setAmount('');
    setCategory('');
    setNote('');
    setCardId('');
    setType('expense');
    setEditingTx(null);
    setIsRecurring(false);
    setFrequency('monthly');
    setModalVisible(false);
  }

  function handleEdit(tx: Transaction) {
    setEditingTx(tx);
    setType(tx.type);
    setAmount(tx.amount.toString());
    setCategory(tx.category);
    setNote(tx.note);
    setCardId(tx.cardId || '');
    setModalVisible(true);
  }

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert(t('invalidAmount'), t('enterValidAmount'));
      return;
    }
    if (!category) {
      Alert.alert(t('selectCategory'), t('pleaseSelectCategory'));
      return;
    }
    if (editingTx) {
      dispatch({
        type: 'UPDATE_TRANSACTION',
        payload: { ...editingTx, amount: parsed, type, category, note, cardId: cardId || undefined },
      });
    } else {
      const tx: Transaction = {
        id: generateId(),
        amount: parsed,
        type,
        category,
        note,
        date: new Date().toISOString(),
        cardId: cardId || undefined,
      };
      dispatch({ type: 'ADD_TRANSACTION', payload: tx });
      if (isRecurring) {
        dispatch({
          type: 'ADD_RECURRING',
          payload: {
            id: generateId(),
            amount: parsed,
            type,
            category,
            note,
            frequency,
            lastAddedDate: new Date().toISOString(),
          },
        });
      }
    }
    resetForm();
  }

  function handleDelete(id: string) {
    Alert.alert(t('delete'), t('removeTransaction'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => dispatch({ type: 'DELETE_TRANSACTION', payload: id }) },
    ]);
  }

  const months = useMemo(() => {
    const set = new Set(transactions.map(tx => tx.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('transactions')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textFaint} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchTransactions')}
          placeholderTextColor={theme.colors.textFaint}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && Platform.OS === 'android' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Type filter */}
      <View style={styles.typeFilterRow}>
        {(['all', 'expense', 'income'] as const).map(ft => (
          <TouchableOpacity
            key={ft}
            style={[
              styles.typeFilterChip,
              filterType === ft && (
                ft === 'expense' ? styles.typeFilterExpenseActive :
                ft === 'income' ? styles.typeFilterIncomeActive :
                styles.typeFilterAllActive
              ),
            ]}
            onPress={() => setFilterType(ft)}
          >
            <Text style={[
              styles.typeFilterText,
              filterType === ft && styles.typeFilterTextActive,
            ]}>
              {ft === 'all' ? t('all') : ft === 'expense' ? t('expense') : t('incomeType')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month filter */}
      {months.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          <TouchableOpacity
            style={[styles.filterChip, !filterMonth && styles.filterChipActive]}
            onPress={() => setFilterMonth('')}
          >
            <Text style={[styles.filterChipText, !filterMonth && styles.filterChipTextActive]}>{t('all')}</Text>
          </TouchableOpacity>
          {months.map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.filterChip, filterMonth === m && styles.filterChipActive]}
              onPress={() => setFilterMonth(m)}
            >
              <Text style={[styles.filterChipText, filterMonth === m && styles.filterChipTextActive]}>
                {format(new Date(m + '-01'), 'MMM yyyy')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.filterChip, !filterCategory && styles.filterChipActive]}
          onPress={() => setFilterCategory('')}
        >
          <Text style={[styles.filterChipText, !filterCategory && styles.filterChipTextActive]}>{t('all')}</Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, filterCategory === cat && styles.filterChipActive]}
            onPress={() => setFilterCategory(filterCategory === cat ? '' : cat)}
          >
            <Text style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TransactionItem item={item} currency={currency} locale={locale} cards={cards} theme={theme} styles={styles} onDelete={handleDelete} onEdit={handleEdit} />
        )}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={theme.colors.textFaint} />
            <Text style={styles.emptyText}>{t('noTransactions')}</Text>
            <Text style={styles.emptyHint}>{t('tapToAdd')}</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={resetForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTx ? t('editTransaction') : t('addTransaction')}</Text>
              <TouchableOpacity onPress={resetForm}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
                  onPress={() => setType('expense')}
                >
                  <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>{t('expense')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'income' && styles.typeBtnIncomeActive]}
                  onPress={() => setType('income')}
                >
                  <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>{t('incomeType')}</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder={t('amount')}
                placeholderTextColor={theme.colors.textFaint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <TextInput
                style={styles.input}
                placeholder={t('noteOptional')}
                placeholderTextColor={theme.colors.textFaint}
                value={note}
                onChangeText={setNote}
              />

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, category === cat && { backgroundColor: CATEGORY_COLORS[cat] || theme.colors.primary }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {cards.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>{t('cardOptional')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                    <TouchableOpacity
                      style={[styles.catChip, !cardId && styles.noCardChipActive]}
                      onPress={() => setCardId('')}
                    >
                      <Text style={[styles.catChipText, !cardId && styles.catChipTextActive]}>{t('noCard')}</Text>
                    </TouchableOpacity>
                    {cards.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catChip, cardId === c.id && { backgroundColor: c.color }]}
                        onPress={() => setCardId(c.id)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="card-outline" size={12} color={cardId === c.id ? '#fff' : theme.colors.textMuted} />
                          <Text style={[styles.catChipText, cardId === c.id && styles.catChipTextActive]}>{c.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {!editingTx && (
                <>
                  <View style={styles.recurringRow}>
                    <Text style={styles.inputLabel}>{t('recurring')}</Text>
                    <Switch
                      value={isRecurring}
                      onValueChange={setIsRecurring}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }}
                      thumbColor={isRecurring ? theme.colors.primary : theme.colors.textFaint}
                    />
                  </View>
                  {isRecurring && (
                    <View style={styles.freqRow}>
                      {FREQ_OPTIONS.map(f => (
                        <TouchableOpacity
                          key={f}
                          style={[styles.catChip, frequency === f && styles.freqChipActive]}
                          onPress={() => setFrequency(f)}
                        >
                          <Text style={[styles.catChipText, frequency === f && styles.catChipTextActive]}>{t(f as any)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{editingTx ? t('updateTransaction') : t('saveTransaction')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      paddingTop: 20,
    },
    header: { fontSize: 28, fontWeight: '800', color: theme.colors.text },
    addBtn: {
      backgroundColor: theme.colors.primary,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: theme.colors.text },
    typeFilterRow: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 10,
      gap: 8,
    },
    typeFilterChip: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    typeFilterAllActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    typeFilterExpenseActive: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
    typeFilterIncomeActive: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
    typeFilterText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
    typeFilterTextActive: { color: '#fff' },
    filterBar: { maxHeight: 44 },
    filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterChipText: { fontSize: 13, color: theme.colors.textMuted },
    filterChipTextActive: { color: '#fff', fontWeight: '600' },
    item: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...theme.shadow.card,
    },
    iconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    itemInfo: { flex: 1 },
    itemCategory: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
    itemNote: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
    itemDate: { fontSize: 11, color: theme.colors.textFaint, marginTop: 1 },
    itemMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 1 },
    cardBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    cardBadgeText: { fontSize: 10, fontWeight: '600' },
    noCardChipActive: { backgroundColor: theme.colors.primary },
    itemAmount: { fontSize: 16, fontWeight: '700' },
    editBtn: { padding: 8 },
    deleteBtn: { padding: 8 },
    emptyContainer: { flex: 1, justifyContent: 'center' },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: 16, color: theme.colors.textMuted, fontWeight: '500', marginTop: 12 },
    emptyHint: { fontSize: 13, color: theme.colors.textFaint, marginTop: 4 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    typeToggle: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 12,
      padding: 4,
      marginBottom: 16,
    },
    typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    typeBtnActive: { backgroundColor: theme.colors.danger },
    typeBtnIncomeActive: { backgroundColor: theme.colors.success },
    typeBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
    typeBtnTextActive: { color: '#fff' },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      marginBottom: 12,
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
    },
    inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8 },
    catScroll: { marginBottom: 16 },
    catChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceMuted,
      marginRight: 8,
    },
    catChipText: { fontSize: 13, color: theme.colors.textMuted },
    catChipTextActive: { color: '#fff', fontWeight: '600' },
    recurringRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    freqRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    freqChipActive: { backgroundColor: theme.colors.primary },
    saveBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 8,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
