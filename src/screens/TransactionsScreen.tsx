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
import { useTranslation } from '../hooks/useTranslation';
import { Transaction, RecurringFrequency } from '../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../constants/categories';
import { format } from 'date-fns';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function TransactionItem({
  item,
  currency,
  onDelete,
  onEdit,
}: {
  item: Transaction;
  currency: string;
  onDelete: (id: string) => void;
  onEdit: (item: Transaction) => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);

  return (
    <View style={styles.item}>
      <View style={[styles.iconBg, { backgroundColor: CATEGORY_COLORS[item.category] + '22' }]}>
        <Ionicons
          name={(CATEGORY_ICONS[item.category] || 'ellipsis-horizontal') as any}
          size={20}
          color={CATEGORY_COLORS[item.category] || '#636E72'}
        />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemCategory}>{item.category}</Text>
        <Text style={styles.itemNote} numberOfLines={1}>{item.note || format(new Date(item.date), 'MMM d, yyyy')}</Text>
        {item.note ? <Text style={styles.itemDate}>{format(new Date(item.date), 'MMM d, yyyy')}</Text> : null}
      </View>
      <Text style={[styles.itemAmount, { color: item.type === 'income' ? '#00B894' : '#D63031' }]}>
        {item.type === 'income' ? '+' : '-'}{fmt(item.amount)}
      </Text>
      <TouchableOpacity onPress={() => onEdit(item)} style={styles.editBtn}>
        <Ionicons name="pencil-outline" size={16} color="#B2BEC3" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color="#B2BEC3" />
      </TouchableOpacity>
    </View>
  );
}

const FREQ_OPTIONS: RecurringFrequency[] = ['daily', 'weekly', 'monthly'];

export default function TransactionsScreen() {
  const { state, dispatch } = useApp();
  const t = useTranslation();
  const { transactions, currency, categories } = state;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
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
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        tx =>
          tx.note.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [transactions, filterMonth, filterCategory, searchQuery]);

  function resetForm() {
    setAmount('');
    setCategory('');
    setNote('');
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
        payload: { ...editingTx, amount: parsed, type, category, note },
      });
    } else {
      const tx: Transaction = {
        id: generateId(),
        amount: parsed,
        type,
        category,
        note,
        date: new Date().toISOString(),
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
        <Ionicons name="search-outline" size={18} color="#B2BEC3" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchTransactions')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && Platform.OS === 'android' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#B2BEC3" />
          </TouchableOpacity>
        )}
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
          <TransactionItem item={item} currency={currency} onDelete={handleDelete} onEdit={handleEdit} />
        )}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color="#B2BEC3" />
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
                <Ionicons name="close" size={24} color="#636E72" />
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
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <TextInput
                style={styles.input}
                placeholder={t('noteOptional')}
                value={note}
                onChangeText={setNote}
              />

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, category === cat && { backgroundColor: CATEGORY_COLORS[cat] || '#6C5CE7' }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {!editingTx && (
                <>
                  <View style={styles.recurringRow}>
                    <Text style={styles.inputLabel}>{t('recurring')}</Text>
                    <Switch
                      value={isRecurring}
                      onValueChange={setIsRecurring}
                      trackColor={{ false: '#DFE6E9', true: '#A29BFE' }}
                      thumbColor={isRecurring ? '#6C5CE7' : '#B2BEC3'}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 20,
  },
  header: { fontSize: 28, fontWeight: '700', color: '#2D3436' },
  addBtn: {
    backgroundColor: '#6C5CE7',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DFE6E9',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: '#2D3436' },
  filterBar: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DFE6E9',
  },
  filterChipActive: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  filterChipText: { fontSize: 13, color: '#636E72' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  item: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  itemCategory: { fontSize: 14, fontWeight: '600', color: '#2D3436' },
  itemNote: { fontSize: 12, color: '#636E72', marginTop: 2 },
  itemDate: { fontSize: 11, color: '#B2BEC3', marginTop: 1 },
  itemAmount: { fontSize: 16, fontWeight: '700' },
  editBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#636E72', fontWeight: '500', marginTop: 12 },
  emptyHint: { fontSize: 13, color: '#B2BEC3', marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2D3436' },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#D63031' },
  typeBtnIncomeActive: { backgroundColor: '#00B894' },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: '#636E72' },
  typeBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#636E72', marginBottom: 8 },
  catScroll: { marginBottom: 16 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
    marginRight: 8,
  },
  catChipText: { fontSize: 13, color: '#636E72' },
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
  freqChipActive: { backgroundColor: '#6C5CE7' },
  saveBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
