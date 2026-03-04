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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Transaction } from '../types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../constants/categories';
import { format } from 'date-fns';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function TransactionItem({
  item,
  currency,
  onDelete,
}: {
  item: Transaction;
  currency: string;
  onDelete: (id: string) => void;
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
      <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color="#B2BEC3" />
      </TouchableOpacity>
    </View>
  );
}

export default function TransactionsScreen() {
  const { state, dispatch } = useApp();
  const { transactions, currency, categories } = state;

  const [modalVisible, setModalVisible] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const filtered = useMemo(() => {
    if (!filterMonth) return transactions;
    return transactions.filter(t => t.date.startsWith(filterMonth));
  }, [transactions, filterMonth]);

  function handleAdd() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (!category) {
      Alert.alert('Select category', 'Please select a category.');
      return;
    }
    const tx: Transaction = {
      id: generateId(),
      amount: parsed,
      type,
      category,
      note,
      date: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: tx });
    setAmount('');
    setCategory('');
    setNote('');
    setType('expense');
    setModalVisible(false);
  }

  function handleDelete(id: string) {
    Alert.alert('Delete', 'Remove this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_TRANSACTION', payload: id }) },
    ]);
  }

  const months = useMemo(() => {
    const set = new Set(transactions.map(t => t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Transactions</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {months.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          <TouchableOpacity
            style={[styles.filterChip, !filterMonth && styles.filterChipActive]}
            onPress={() => setFilterMonth('')}
          >
            <Text style={[styles.filterChipText, !filterMonth && styles.filterChipTextActive]}>All</Text>
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

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TransactionItem item={item} currency={currency} onDelete={handleDelete} />
        )}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color="#B2BEC3" />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptyHint}>Tap + to add your first transaction</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Transaction</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>

            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
                onPress={() => setType('expense')}
              >
                <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && styles.typeBtnIncomeActive]}
                onPress={() => setType('income')}
              >
                <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>Income</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              value={note}
              onChangeText={setNote}
            />

            <Text style={styles.inputLabel}>Category</Text>
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

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
              <Text style={styles.saveBtnText}>Save Transaction</Text>
            </TouchableOpacity>
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
  filterBar: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
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
  catScroll: { marginBottom: 20 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
    marginRight: 8,
  },
  catChipText: { fontSize: 13, color: '#636E72' },
  catChipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
