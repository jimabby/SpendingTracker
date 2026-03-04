import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { clearState, defaultState } from '../storage/storage';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'CAD'];

const AI_PROVIDERS = [
  { id: 'chatgpt', label: 'ChatGPT', hint: 'platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Gemini', hint: 'aistudio.google.com/app/apikey' },
  { id: 'claude', label: 'Claude', hint: 'console.anthropic.com/settings/keys' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'platform.deepseek.com/api_keys' },
];

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon as any} size={18} color={danger ? '#D63031' : '#6C5CE7'} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color="#B2BEC3" />
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { state, dispatch } = useApp();
  const { currency, categories, aiProvider, aiKey } = state;

  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [keyInput, setKeyInput] = useState(aiKey);
  const [showKey, setShowKey] = useState(false);

  const selectedProvider = AI_PROVIDERS.find(p => p.id === aiProvider) || AI_PROVIDERS[0];

  function handleClearData() {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all transactions, cards, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearState();
            dispatch({ type: 'LOAD_STATE', payload: defaultState });
          },
        },
      ]
    );
  }

  function handleAddCategory() {
    const cat = newCat.trim();
    if (!cat) return;
    if (categories.includes(cat)) {
      Alert.alert('Already exists');
      return;
    }
    dispatch({ type: 'ADD_CATEGORY', payload: cat });
    setNewCat('');
  }

  function handleDeleteCategory(cat: string) {
    Alert.alert('Delete category', `Remove "${cat}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_CATEGORY', payload: cat }) },
    ]);
  }

  function handleSaveApiKey() {
    dispatch({ type: 'SET_AI_SETTINGS', payload: { provider: aiProvider, apiKey: keyInput.trim() } });
    Alert.alert('Saved', 'API key saved successfully.');
  }

  function handleSelectProvider(id: string) {
    dispatch({ type: 'SET_AI_SETTINGS', payload: { provider: id, apiKey: aiKey } });
  }

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.section}>
        <Text style={{ padding: 16, paddingBottom: 8, fontSize: 13, color: '#636E72' }}>Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyRow} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 12 }}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
              onPress={() => dispatch({ type: 'SET_CURRENCY', payload: c })}
            >
              <Text style={[styles.currencyChipText, currency === c && styles.currencyChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.sectionTitle}>Categories</Text>
      <View style={styles.section}>
        <SettingRow
          icon="pricetags-outline"
          label="Manage Categories"
          value={`${categories.length} categories`}
          onPress={() => setCatModalVisible(true)}
        />
      </View>

      <Text style={styles.sectionTitle}>AI Assistant</Text>
      <View style={styles.section}>
        <Text style={styles.aiSubLabel}>Provider</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerRow}>
          {AI_PROVIDERS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.providerChip, aiProvider === p.id && styles.providerChipActive]}
              onPress={() => handleSelectProvider(p.id)}
            >
              <Text style={[styles.providerChipText, aiProvider === p.id && styles.providerChipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.aiSubLabel}>API Key</Text>
        <View style={styles.apiKeyRow}>
          <TextInput
            style={styles.apiKeyInput}
            placeholder="Paste your API key here"
            value={keyInput}
            onChangeText={setKeyInput}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(v => !v)}>
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color="#636E72" />
          </TouchableOpacity>
        </View>
        <Text style={styles.apiKeyHint}>
          Get your key at: {selectedProvider.hint}
        </Text>
        <TouchableOpacity style={styles.saveKeyBtn} onPress={handleSaveApiKey}>
          <Text style={styles.saveKeyBtnText}>Save API Key</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.section}>
        <SettingRow
          icon="trash-outline"
          label="Clear All Data"
          onPress={handleClearData}
          danger
        />
      </View>

      <Text style={styles.sectionTitle}>Coming Soon</Text>
      <View style={styles.section}>
        <View style={styles.comingSoon}>
          <Ionicons name="cloud-outline" size={20} color="#B2BEC3" />
          <Text style={styles.comingSoonText}>Cloud Sync & Login</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>Soon</Text></View>
        </View>
      </View>

      <Text style={styles.version}>Pockyt v1.0</Text>

      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Categories</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>

            <View style={styles.addRow}>
              <TextInput
                style={styles.catInput}
                placeholder="New category name"
                value={newCat}
                onChangeText={setNewCat}
              />
              <TouchableOpacity style={styles.addCatBtn} onPress={handleAddCategory}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {categories.map(cat => (
                <View key={cat} style={styles.catRow}>
                  <Text style={styles.catName}>{cat}</Text>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat)}>
                    <Ionicons name="trash-outline" size={18} color="#B2BEC3" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 28, fontWeight: '700', color: '#2D3436', marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#B2BEC3', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16, paddingLeft: 4 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEE9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: '#FFEAEA' },
  rowLabel: { flex: 1, fontSize: 15, color: '#2D3436' },
  rowLabelDanger: { color: '#D63031' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 13, color: '#636E72' },
  currencyRow: {},
  currencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
  },
  currencyChipActive: { backgroundColor: '#6C5CE7' },
  currencyChipText: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  currencyChipTextActive: { color: '#fff' },
  aiSubLabel: { fontSize: 13, color: '#636E72', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  providerRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 12 },
  providerChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
  },
  providerChipActive: { backgroundColor: '#6C5CE7' },
  providerChipText: { fontSize: 13, fontWeight: '600', color: '#636E72' },
  providerChipTextActive: { color: '#fff' },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 14,
  },
  apiKeyInput: { flex: 1, fontSize: 14, paddingVertical: 12 },
  eyeBtn: { padding: 4 },
  apiKeyHint: { fontSize: 11, color: '#B2BEC3', marginHorizontal: 16, marginTop: 6 },
  saveKeyBtn: {
    margin: 16,
    marginTop: 12,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  saveKeyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  comingSoonText: { flex: 1, fontSize: 15, color: '#B2BEC3' },
  badge: { backgroundColor: '#F0F0F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, color: '#B2BEC3', fontWeight: '600' },
  version: { textAlign: 'center', color: '#B2BEC3', fontSize: 12, marginTop: 32 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2D3436' },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  catInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#F8F9FA',
  },
  addCatBtn: {
    backgroundColor: '#6C5CE7',
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  catName: { flex: 1, fontSize: 15, color: '#2D3436' },
});
