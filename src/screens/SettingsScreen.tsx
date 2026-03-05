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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { format } from 'date-fns';
import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
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
  const t = useTranslation();
  const { currency, categories, aiProvider, aiKey, language, budgets, transactions } = state;

  const [catModalVisible, setCatModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [keyInput, setKeyInput] = useState(aiKey);
  const [showKey, setShowKey] = useState(false);
  const [localBudgets, setLocalBudgets] = useState<Record<string, string>>({});

  const selectedProvider = AI_PROVIDERS.find(p => p.id === aiProvider) || AI_PROVIDERS[0];
  const budgetCount = Object.values(budgets).filter(v => v > 0).length;

  function handleOpenBudgetModal() {
    const initial: Record<string, string> = {};
    categories.forEach(cat => {
      initial[cat] = budgets[cat] ? budgets[cat].toString() : '';
    });
    setLocalBudgets(initial);
    setBudgetModalVisible(true);
  }

  function handleSaveBudgets() {
    categories.forEach(cat => {
      const val = parseFloat(localBudgets[cat] || '');
      if (val > 0) {
        dispatch({ type: 'SET_BUDGET', payload: { category: cat, amount: val } });
      } else if (budgets[cat]) {
        dispatch({ type: 'DELETE_BUDGET', payload: cat });
      }
    });
    setBudgetModalVisible(false);
  }

  function handleExportCSV() {
    if (transactions.length === 0) {
      Alert.alert(t('noDataToExport'));
      return;
    }
    setEmailInput('');
    setEmailModalVisible(true);
  }

  async function handleSendEmail() {
    if (emailSending) return; // guard against double-tap
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert(t('invalidEmail'), t('enterValidEmail'));
      return;
    }

    const header = 'Date,Type,Category,Amount,Note\n';
    const rows = transactions
      .map(tx => {
        const date = format(new Date(tx.date), 'yyyy-MM-dd');
        const note = (tx.note || '').replace(/"/g, '""');
        return `${date},${tx.type},${tx.category},${tx.amount},"${note}"`;
      })
      .join('\n');
    const csv = header + rows;

    // Keep sending=true until done so button stays disabled
    setEmailSending(true);
    setEmailModalVisible(false);

    // Wait for modal dismiss animation to finish — iOS cannot present
    // the mail composer while another view controller is transitioning
    await new Promise(resolve => setTimeout(resolve, 700));

    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        const subject = encodeURIComponent('Pockyt Transactions Export');
        const body = encodeURIComponent(csv);
        await Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
        return;
      }

      // Try to attach the CSV as a file
      try {
        const fileName = `pockyt_export_${format(new Date(), 'yyyyMMdd')}.csv`;
        const filePath = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + fileName;
        await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await MailComposer.composeAsync({
          recipients: [email],
          subject: 'Pockyt Transactions Export',
          body: 'Please find your Pockyt transaction history attached.',
          attachments: [filePath],
        });
      } catch {
        // File attachment failed — compose with CSV in body instead
        await MailComposer.composeAsync({
          recipients: [email],
          subject: 'Pockyt Transactions Export',
          body: csv,
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not open the mail client.');
    } finally {
      setEmailSending(false);
    }
  }

  function handleClearData() {
    Alert.alert(
      t('clearAllData'),
      t('clearAllDataConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('clearAll'),
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
      Alert.alert(t('alreadyExists'));
      return;
    }
    dispatch({ type: 'ADD_CATEGORY', payload: cat });
    setNewCat('');
  }

  function handleDeleteCategory(cat: string) {
    Alert.alert(t('deleteCategory'), t('removeCategoryPrompt')(cat), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => dispatch({ type: 'DELETE_CATEGORY', payload: cat }) },
    ]);
  }

  function handleSaveApiKey() {
    dispatch({ type: 'SET_AI_SETTINGS', payload: { provider: aiProvider, apiKey: keyInput.trim() } });
    Alert.alert(t('saved'), t('apiKeySaved'));
  }

  function handleSelectProvider(id: string) {
    dispatch({ type: 'SET_AI_SETTINGS', payload: { provider: id, apiKey: aiKey } });
  }

  return (
    <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.header}>{t('settingsHeader')}</Text>

      <Text style={styles.sectionTitle}>{t('preferences')}</Text>
      <View style={styles.section}>
        <Text style={{ padding: 16, paddingBottom: 8, fontSize: 13, color: '#636E72' }}>{t('currencyLabel')}</Text>
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

      <Text style={styles.sectionTitle}>{t('categoriesLabel')}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="pricetags-outline"
          label={t('manageCategories')}
          value={t('categoriesCount')(categories.length)}
          onPress={() => setCatModalVisible(true)}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('budgetLimits')}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="wallet-outline"
          label={t('setBudget')}
          value={budgetCount > 0 ? t('categoriesCount')(budgetCount) : undefined}
          onPress={handleOpenBudgetModal}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('languageLabel')}</Text>
      <View style={styles.section}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', gap: 8 }}>
          {[{ id: 'en', label: 'English' }, { id: 'zh', label: '中文' }].map(lang => (
            <TouchableOpacity
              key={lang.id}
              style={[styles.currencyChip, language === lang.id && styles.currencyChipActive]}
              onPress={() => dispatch({ type: 'SET_LANGUAGE', payload: lang.id })}
            >
              <Text style={[styles.currencyChipText, language === lang.id && styles.currencyChipTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('aiAssistant')}</Text>
      <View style={styles.section}>
        <Text style={styles.aiSubLabel}>{t('providerLabel')}</Text>
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

        <Text style={styles.aiSubLabel}>{t('apiKeyLabel')}</Text>
        <View style={styles.apiKeyRow}>
          <TextInput
            style={styles.apiKeyInput}
            placeholder={t('pasteApiKey')}
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
          <Text style={styles.saveKeyBtnText}>{t('saveApiKey')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>{t('dataLabel')}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="download-outline"
          label={t('exportCSV')}
          onPress={handleExportCSV}
        />
        <SettingRow
          icon="trash-outline"
          label={t('clearAllData')}
          onPress={handleClearData}
          danger
        />
      </View>

      <Text style={styles.sectionTitle}>{t('comingSoon')}</Text>
      <View style={styles.section}>
        <View style={styles.comingSoon}>
          <Ionicons name="cloud-outline" size={20} color="#B2BEC3" />
          <Text style={styles.comingSoonText}>{t('cloudSync')}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{t('soon')}</Text></View>
        </View>
      </View>

      <Text style={styles.version}>{t('version')}</Text>

      {/* Categories modal */}
      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('categoriesLabel')}</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>

            <View style={styles.addRow}>
              <TextInput
                style={styles.catInput}
                placeholder={t('newCategoryPlaceholder')}
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

      {/* Email export modal */}
      <Modal visible={emailModalVisible} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.emailOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmailModalVisible(false)} />
          <View style={styles.emailCard}>
            <View style={styles.emailIconWrap}>
              <Ionicons name="mail-outline" size={28} color="#6C5CE7" />
            </View>
            <Text style={styles.emailTitle}>{t('sendToEmail')}</Text>
            <Text style={styles.emailSubtitle}>
              {language === 'zh'
                ? '导出的 CSV 文件将以附件形式发送'
                : 'Your CSV file will be sent as an attachment'}
            </Text>
            <TextInput
              style={styles.emailInput}
              placeholder={t('enterEmail')}
              placeholderTextColor="#B2BEC3"
              value={emailInput}
              onChangeText={setEmailInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSendEmail}
              autoFocus
            />
            <View style={styles.emailBtnRow}>
              <TouchableOpacity
                style={styles.emailCancelBtn}
                onPress={() => setEmailModalVisible(false)}
              >
                <Text style={styles.emailCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emailSendBtn} onPress={handleSendEmail} disabled={emailSending}>
                {emailSending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.emailSendText}>{t('send')}</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Budget modal */}
      <Modal visible={budgetModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('budgetLimits')}</Text>
              <TouchableOpacity onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>
            <Text style={styles.budgetHint}>{t('noBudgetsHint')}</Text>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {categories.map(cat => (
                <View key={cat} style={styles.budgetInputRow}>
                  <Text style={styles.budgetCatName}>{cat}</Text>
                  <TextInput
                    style={styles.budgetInput}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={localBudgets[cat] || ''}
                    onChangeText={val => setLocalBudgets(prev => ({ ...prev, [cat]: val }))}
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.saveKeyBtn} onPress={handleSaveBudgets}>
              <Text style={styles.saveKeyBtnText}>{t('setBudget')}</Text>
            </TouchableOpacity>
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
  budgetHint: { fontSize: 12, color: '#B2BEC3', marginBottom: 12 },
  budgetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  budgetCatName: { flex: 1, fontSize: 15, color: '#2D3436' },
  budgetInput: {
    width: 90,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    textAlign: 'right',
    backgroundColor: '#F8F9FA',
  },
  emailOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 24,
  },
  emailCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  emailIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EEE9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emailTitle: { fontSize: 20, fontWeight: '700', color: '#2D3436', marginBottom: 6 },
  emailSubtitle: { fontSize: 13, color: '#636E72', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  emailInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#DFE6E9',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#2D3436',
    backgroundColor: '#F8F9FA',
    marginBottom: 20,
  },
  emailBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  emailCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
  },
  emailCancelText: { fontSize: 15, fontWeight: '600', color: '#636E72' },
  emailSendBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSendText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
