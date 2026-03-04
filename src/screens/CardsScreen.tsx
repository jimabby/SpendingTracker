import React, { useState, useRef } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { Card } from '../types';
import { CARD_COLORS } from '../constants/categories';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function daysUntilDue(dueDate: string): number {
  const [month, day] = dueDate.split('-').map(Number);
  const today = new Date();
  let due = new Date(today.getFullYear(), month - 1, day);
  if (due <= today) due = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueDate(dueDate: string): string {
  const [month, day] = dueDate.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

function CardItem({ card, onDelete }: { card: Card; onDelete: (id: string) => void }) {
  const days = daysUntilDue(card.dueDate);
  return (
    <View style={[styles.cardItem, { backgroundColor: card.color }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{card.name}</Text>
        <TouchableOpacity onPress={() => onDelete(card.id)}>
          <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
      <Text style={styles.cardNumber}>•••• •••• •••• {card.lastFour}</Text>
      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.cardDueLabel}>Payment Due</Text>
          <Text style={styles.cardDueText}>
            {formatDueDate(card.dueDate)} · {days === 0 ? 'Today!' : `${days}d left`}
          </Text>
        </View>
        <View style={styles.cardChip}>
          <View style={styles.chipInner} />
        </View>
      </View>
      {card.benefits ? (
        <View style={styles.benefitsRow}>
          <Ionicons name="gift-outline" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={styles.benefitsText} numberOfLines={2}>{card.benefits}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function CardsScreen() {
  const { state, dispatch } = useApp();
  const { cards } = state;

  const scrollViewRef = useRef<ScrollView>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1);
  const [benefits, setBenefits] = useState('');
  const [selectedColor, setSelectedColor] = useState(CARD_COLORS[0]);

  function handleAdd() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    if (!/^\d{4}$/.test(lastFour)) { Alert.alert('Enter last 4 digits'); return; }

    const card: Card = {
      id: generateId(),
      name: name.trim(),
      lastFour,
      dueDate: `${selectedMonth}-${selectedDay}`,
      benefits: benefits.trim(),
      color: selectedColor,
    };
    dispatch({ type: 'ADD_CARD', payload: card });
    setName(''); setLastFour(''); setBenefits('');
    setSelectedMonth(1); setSelectedDay(1);
    setSelectedColor(CARD_COLORS[0]);
    setModalVisible(false);
  }

  function handleDelete(id: string) {
    Alert.alert('Delete Card', 'Remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_CARD', payload: id }) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>My Cards</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={cards}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <CardItem card={item} onDelete={handleDelete} />}
        contentContainerStyle={cards.length === 0 ? styles.emptyContainer : { padding: 16, gap: 16 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={56} color="#B2BEC3" />
            <Text style={styles.emptyText}>No cards yet</Text>
            <Text style={styles.emptyHint}>Add your credit cards to track due dates</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Card</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>

            <ScrollView ref={scrollViewRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput style={styles.input} placeholder="Card name (e.g. Chase Sapphire)" value={name} onChangeText={setName} />
              <TextInput
                style={styles.input}
                placeholder="Last 4 digits"
                keyboardType="number-pad"
                maxLength={4}
                value={lastFour}
                onChangeText={setLastFour}
              />

              <Text style={styles.inputLabel}>Payment Due Date</Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerCol}>
                  <Text style={styles.pickerHeader}>Month</Text>
                  <Picker
                    selectedValue={selectedMonth}
                    onValueChange={(v) => setSelectedMonth(v)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {MONTHS.map((m, i) => (
                      <Picker.Item key={m} label={m} value={i + 1} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.pickerDivider} />
                <View style={styles.pickerCol}>
                  <Text style={styles.pickerHeader}>Day</Text>
                  <Picker
                    selectedValue={selectedDay}
                    onValueChange={(v) => setSelectedDay(v)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {DAYS.map(d => (
                      <Picker.Item key={d} label={String(d)} value={d} />
                    ))}
                  </Picker>
                </View>
              </View>

              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="Benefits / rewards (optional)"
                multiline
                value={benefits}
                onChangeText={setBenefits}
                onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)}
              />

              <Text style={styles.inputLabel}>Card color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow}>
                {CARD_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, selectedColor === c && styles.colorDotSelected]}
                    onPress={() => setSelectedColor(c)}
                  />
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                <Text style={styles.saveBtnText}>Add Card</Text>
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
  cardItem: {
    borderRadius: 20,
    padding: 20,
    minHeight: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  cardNumber: { fontSize: 16, color: 'rgba(255,255,255,0.8)', letterSpacing: 2, marginBottom: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardDueLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  cardDueText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  cardChip: {
    width: 36,
    height: 26,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInner: { width: 20, height: 16, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  benefitsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  benefitsText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#636E72', marginTop: 16 },
  emptyHint: { fontSize: 13, color: '#B2BEC3', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
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
  input: {
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
  },
  inputMulti: { height: 72, textAlignVertical: 'top' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#636E72', marginBottom: 6 },
  pickerRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    marginBottom: 12,
    overflow: 'hidden',
  },
  pickerCol: { flex: 1 },
  pickerHeader: { textAlign: 'center', fontSize: 12, color: '#636E72', paddingTop: 8 },
  pickerDivider: { width: 1, backgroundColor: '#DFE6E9', marginVertical: 8 },
  picker: { height: 120 },
  pickerItem: { fontSize: 16, height: 120 },
  colorRow: { marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  saveBtn: { backgroundColor: '#6C5CE7', borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
