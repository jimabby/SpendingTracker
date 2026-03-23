import React, { useState, useMemo } from 'react';
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
  ActivityIndicator,
  Linking,
  Share,
  Switch,
} from 'react-native';
import { format } from 'date-fns';
import * as Print from 'expo-print';
import * as MailComposer from 'expo-mail-composer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { clearState, defaultState, exportState, importState } from '../storage/storage';
import { AppTheme } from '../constants/theme';

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
  theme,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  theme: AppTheme;
}) {
  return (
    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }} onPress={onPress}>
      <View style={[{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? (theme.colors.danger + '18') : (theme.colors.primary + '18') }]}>
        <Ionicons name={icon as any} size={18} color={danger ? theme.colors.danger : theme.colors.primary} />
      </View>
      <Text style={[{ flex: 1, fontSize: 15, color: danger ? theme.colors.danger : theme.colors.text }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value ? <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} />
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const { currency, categories, aiProvider, aiKey, language, budgets, transactions, recurringTransactions } = state;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  const [catModalVisible, setCatModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [restoreInput, setRestoreInput] = useState('');
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
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

  function handleExportPDF() {
    if (transactions.length === 0) {
      Alert.alert(t('noDataToExport'));
      return;
    }
    setEmailInput('');
    setEmailModalVisible(true);
  }

  async function handleSendPDF() {
    if (emailSending) return;
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert(t('invalidEmail'), t('enterValidEmail'));
      return;
    }
    setEmailSending(true);
    setEmailModalVisible(false);
    await new Promise(resolve => setTimeout(resolve, 700));
    try {
      const fmt = (n: number) =>
        new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);

      const totalIncome = transactions
        .filter(tx => tx.type === 'income')
        .reduce((s, tx) => s + tx.amount, 0);
      const totalExpense = transactions
        .filter(tx => tx.type === 'expense')
        .reduce((s, tx) => s + tx.amount, 0);

      const byMonth: Record<string, typeof transactions> = {};
      transactions.forEach(tx => {
        const key = tx.date.slice(0, 7);
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(tx);
      });
      const months = Object.keys(byMonth).sort().reverse();

      const monthSections = months.map(m => {
        const label = format(new Date(m + '-01'), 'MMMM yyyy');
        const rows = byMonth[m]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map(tx => {
            const isExpense = tx.type === 'expense';
            const amtColor = isExpense ? '#D63031' : '#00B894';
            const sign = isExpense ? '\u2212' : '+';
            return `
              <tr>
                <td>${format(new Date(tx.date), 'MMM d')}</td>
                <td>${tx.category}</td>
                <td>${tx.note || '\u2014'}</td>
                <td style="color:${amtColor};font-weight:600;text-align:right">${sign}${fmt(tx.amount)}</td>
              </tr>`;
          }).join('');
        const mIncome = byMonth[m].filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
        const mExpense = byMonth[m].filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
        return `
          <div class="month-header">${label}</div>
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align:right;font-weight:700;color:#636E72">Month Total</td>
                <td style="text-align:right;font-weight:700;color:${mExpense > mIncome ? '#D63031' : '#00B894'}">
                  ${fmt(mIncome - mExpense)}
                </td>
              </tr>
            </tfoot>
          </table>`;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1F2937; padding: 32px; }
            .logo { font-size: 28px; font-weight: 800; color: #5B6CFF; margin-bottom: 4px; }
            .subtitle { font-size: 13px; color: #6B7280; margin-bottom: 24px; }
            .summary { display: flex; gap: 16px; margin-bottom: 32px; }
            .summary-card { flex: 1; border-radius: 12px; padding: 16px; }
            .summary-card.income { background: #E8F8F3; }
            .summary-card.expense { background: #FFEAEA; }
            .summary-card.balance { background: #EEF1FA; }
            .summary-label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .summary-value { font-size: 20px; font-weight: 800; }
            .summary-card.income .summary-value { color: #00B894; }
            .summary-card.expense .summary-value { color: #D63031; }
            .summary-card.balance .summary-value { color: #5B6CFF; }
            .month-header { font-size: 15px; font-weight: 700; color: #5B6CFF; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #EEF1FA; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 13px; }
            th { text-align: left; font-size: 11px; color: #94A3B8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; background: #F8FAFC; }
            td { padding: 8px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
            tfoot td { border-top: 1px solid #DEE4F0; border-bottom: none; padding-top: 10px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94A3B8; }
          </style>
        </head>
        <body>
          <div class="logo">Pockyt</div>
          <div class="subtitle">Transaction Report \u00b7 Generated ${format(new Date(), 'MMMM d, yyyy')}</div>
          <div class="summary">
            <div class="summary-card income">
              <div class="summary-label">Total Income</div>
              <div class="summary-value">${fmt(totalIncome)}</div>
            </div>
            <div class="summary-card expense">
              <div class="summary-label">Total Expenses</div>
              <div class="summary-value">${fmt(totalExpense)}</div>
            </div>
            <div class="summary-card balance">
              <div class="summary-label">Net Balance</div>
              <div class="summary-value">${fmt(totalIncome - totalExpense)}</div>
            </div>
          </div>
          ${monthSections}
          <div class="footer">Pockyt \u00b7 ${transactions.length} transactions \u00b7 Exported ${format(new Date(), 'yyyy-MM-dd')}</div>
        </body>
        </html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent('Pockyt Transaction Report')}`);
        return;
      }
      await MailComposer.composeAsync({
        recipients: [email],
        subject: 'Pockyt Transaction Report',
        body: 'Please find your Pockyt transaction report attached as a PDF.',
        attachments: [uri],
      });
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Could not generate PDF.');
    } finally {
      setEmailSending(false);
    }
  }

  async function handleBackup() {
    try {
      const json = await exportState();
      await Share.share({
        message: json,
        title: 'Pockyt Backup',
      });
    } catch (e: any) {
      Alert.alert('Backup Failed', e?.message || '');
    }
  }

  function handleRestore() {
    setRestoreInput('');
    setRestoreModalVisible(true);
  }

  async function handleRestoreConfirm() {
    const text = restoreInput.trim();
    if (!text) return;
    try {
      const restored = await importState(text);
      dispatch({ type: 'IMPORT_STATE', payload: restored });
      setRestoreModalVisible(false);
      Alert.alert(t('saved'), t('dataRestored'));
    } catch {
      Alert.alert(t('invalidAmount'), t('invalidBackupData'));
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

  function handleDeleteRecurring(id: string) {
    Alert.alert(t('deleteRecurring'), t('removeRecurringPrompt'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => dispatch({ type: 'DELETE_RECURRING', payload: id }) },
    ]);
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

      {/* Appearance */}
      <Text style={styles.sectionTitle}>{t('appearance')}</Text>
      <View style={styles.section}>
        <View style={styles.darkModeRow}>
          <View style={styles.darkModeLeft}>
            <View style={[styles.rowIcon, { backgroundColor: theme.colors.primary + '18' }]}>
              <Ionicons name={state.darkMode ? 'moon' : 'moon-outline'} size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.darkModeLabel}>{t('darkMode')}</Text>
          </View>
          <Switch
            value={state.darkMode}
            onValueChange={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }}
            thumbColor={state.darkMode ? theme.colors.primary : theme.colors.textFaint}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('preferences')}</Text>
      <View style={styles.section}>
        <Text style={styles.inlineLabel}>{t('currencyLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, currency === c && styles.chipActive]}
              onPress={() => dispatch({ type: 'SET_CURRENCY', payload: c })}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
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
          theme={theme}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('budgetLimits')}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="wallet-outline"
          label={t('setBudget')}
          value={budgetCount > 0 ? t('categoriesCount')(budgetCount) : undefined}
          onPress={handleOpenBudgetModal}
          theme={theme}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('recurringTransactions')}</Text>
      <View style={styles.section}>
        <SettingRow
          icon="repeat-outline"
          label={t('manageRecurring')}
          value={recurringTransactions.length > 0 ? t('recurringCount')(recurringTransactions.length) : undefined}
          onPress={() => setRecurringModalVisible(true)}
          theme={theme}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('languageLabel')}</Text>
      <View style={styles.section}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', gap: 8 }}>
          {[{ id: 'en', label: 'English' }, { id: 'zh', label: '\u4e2d\u6587' }].map(lang => (
            <TouchableOpacity
              key={lang.id}
              style={[styles.chip, language === lang.id && styles.chipActive]}
              onPress={() => dispatch({ type: 'SET_LANGUAGE', payload: lang.id })}
            >
              <Text style={[styles.chipText, language === lang.id && styles.chipTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('aiAssistant')}</Text>
      <View style={styles.section}>
        <Text style={styles.inlineLabel}>{t('providerLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {AI_PROVIDERS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, aiProvider === p.id && styles.chipActive]}
              onPress={() => handleSelectProvider(p.id)}
            >
              <Text style={[styles.chipText, aiProvider === p.id && styles.chipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.inlineLabel}>{t('apiKeyLabel')}</Text>
        <View style={styles.apiKeyRow}>
          <TextInput
            style={styles.apiKeyInput}
            placeholder={t('pasteApiKey')}
            placeholderTextColor={theme.colors.textFaint}
            value={keyInput}
            onChangeText={setKeyInput}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={{ padding: 10 }} onPress={() => setShowKey(v => !v)}>
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.apiKeyHint}>
          Get your key at: {selectedProvider.hint}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveApiKey}>
          <Text style={styles.primaryBtnText}>{t('saveApiKey')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>{t('dataLabel')}</Text>
      <View style={styles.section}>
        <SettingRow icon="document-text-outline" label={t('exportPDF')} onPress={handleExportPDF} theme={theme} />
        <SettingRow icon="download-outline" label={t('backupData')} onPress={handleBackup} theme={theme} />
        <SettingRow icon="push-outline" label={t('restoreData')} onPress={handleRestore} theme={theme} />
        <SettingRow icon="trash-outline" label={t('clearAllData')} onPress={handleClearData} danger theme={theme} />
      </View>

      <Text style={styles.sectionTitle}>{t('comingSoon')}</Text>
      <View style={styles.section}>
        <View style={styles.comingSoonRow}>
          <Ionicons name="cloud-outline" size={20} color={theme.colors.textFaint} />
          <Text style={[styles.comingSoonText, { color: theme.colors.textFaint }]}>{t('cloudSync')}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{t('soon')}</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('aboutLabel')}</Text>
      <View style={styles.section}>
        <SettingRow icon="information-circle-outline" label={t('aboutUs')} onPress={() => setAboutModalVisible(true)} theme={theme} />
        <SettingRow icon="shield-checkmark-outline" label={t('privacyPolicy')} onPress={() => setPrivacyModalVisible(true)} theme={theme} />
      </View>

      <Text style={styles.version}>{t('version')}</Text>

      {/* About modal */}
      <Modal visible={aboutModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('aboutUs')}</Text>
              <TouchableOpacity onPress={() => setAboutModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 }}>
              <View style={[styles.aboutIcon, { backgroundColor: theme.colors.primary + '18' }]}>
                <Ionicons name="wallet" size={40} color={theme.colors.primary} />
              </View>
              <Text style={[styles.aboutTitle, { color: theme.colors.text }]}>{t('aboutTitle')}</Text>
              <Text style={{ fontSize: 13, color: theme.colors.textFaint, marginBottom: 16 }}>{t('aboutVersion')}</Text>
              <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>{t('aboutDesc')}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textFaint, textAlign: 'center' }}>{t('aboutBuiltWith')}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy modal */}
      <Modal visible={privacyModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('privacyPolicy')}</Text>
              <TouchableOpacity onPress={() => setPrivacyModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.privacySection}>1. Information We Collect</Text>
              <Text style={styles.privacyText}>Pockyt stores all your financial data locally on your device. We do not collect or transmit your personal financial information to our servers.</Text>
              <Text style={styles.privacySection}>2. AI Features</Text>
              <Text style={styles.privacyText}>When you use AI features, your data is sent directly to your chosen AI provider using the API key you provide. We do not store or have access to these requests.</Text>
              <Text style={styles.privacySection}>3. Camera & Photos</Text>
              <Text style={styles.privacyText}>Receipt photos are stored locally on your device only.</Text>
              <Text style={styles.privacySection}>4. Data Security</Text>
              <Text style={styles.privacyText}>Your API keys are stored locally and never shared with us. You can clear all app data at any time from Settings.</Text>
              <Text style={styles.privacySection}>5. Contact</Text>
              <Text style={styles.privacyText}>For questions, contact us at support@pockyt.app.</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textFaint, marginTop: 24, marginBottom: 8, textAlign: 'center' }}>Last updated: March 2026</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Categories modal */}
      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('categoriesLabel')}</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TextInput
                style={[styles.catInput, { flex: 1 }]}
                placeholder={t('newCategoryPlaceholder')}
                placeholderTextColor={theme.colors.textFaint}
                value={newCat}
                onChangeText={setNewCat}
              />
              <TouchableOpacity style={styles.addCatBtn} onPress={handleAddCategory}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {categories.map(cat => (
                <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ flex: 1, fontSize: 15, color: theme.colors.text }}>{cat}</Text>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat)}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.textFaint} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PDF email modal */}
      <Modal visible={emailModalVisible} animationType="fade" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.emailOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmailModalVisible(false)} />
          <View style={styles.emailCard}>
            <View style={[styles.aboutIcon, { backgroundColor: theme.colors.primary + '18', marginBottom: 16 }]}>
              <Ionicons name="document-text-outline" size={28} color={theme.colors.primary} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>{t('exportPDF')}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 20, lineHeight: 18 }}>
              {language === 'zh' ? '\u5c06\u751f\u6210 PDF \u62a5\u544a\u5e76\u901a\u8fc7\u90ae\u4ef6\u53d1\u9001' : 'A PDF report will be generated and sent to your email'}
            </Text>
            <TextInput
              style={styles.emailInput}
              placeholder={t('enterEmail')}
              placeholderTextColor={theme.colors.textFaint}
              value={emailInput}
              onChangeText={setEmailInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSendPDF}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity style={styles.emailCancelBtn} onPress={() => setEmailModalVisible(false)}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.textMuted }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emailSendBtn} onPress={handleSendPDF} disabled={emailSending}>
                {emailSending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{t('send')}</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Restore modal */}
      <Modal visible={restoreModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('restoreData')}</Text>
              <TouchableOpacity onPress={() => setRestoreModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: theme.colors.textFaint, marginBottom: 12 }}>{t('pasteBackupJson')}</Text>
            <TextInput
              style={[styles.catInput, { height: 160, textAlignVertical: 'top', marginBottom: 16 }]}
              multiline
              placeholder="{ ... }"
              placeholderTextColor={theme.colors.textFaint}
              value={restoreInput}
              onChangeText={setRestoreInput}
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRestoreConfirm}>
              <Text style={styles.primaryBtnText}>{t('restoreData')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Recurring transactions modal */}
      <Modal visible={recurringModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('recurringTransactions')}</Text>
              <TouchableOpacity onPress={() => setRecurringModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {recurringTransactions.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="repeat-outline" size={40} color={theme.colors.textFaint} />
                <Text style={{ fontSize: 14, color: theme.colors.textFaint, marginTop: 12 }}>{t('noRecurringYet')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {recurringTransactions.map(r => {
                  const isExpense = r.type === 'expense';
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text }}>
                          {r.category}{r.note ? ` · ${r.note}` : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                          {t(r.frequency as any)} · <Text style={{ color: isExpense ? theme.colors.danger : theme.colors.success }}>
                            {isExpense ? '-' : '+'}{new Intl.NumberFormat(locale, { style: 'currency', currency }).format(r.amount)}
                          </Text>
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteRecurring(r.id)} style={{ padding: 8 }}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Budget modal */}
      <Modal visible={budgetModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('budgetLimits')}</Text>
              <TouchableOpacity onPress={() => setBudgetModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: theme.colors.textFaint, marginBottom: 12 }}>{t('noBudgetsHint')}</Text>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {categories.map(cat => (
                <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ flex: 1, fontSize: 15, color: theme.colors.text }}>{cat}</Text>
                  <TextInput
                    style={styles.budgetInput}
                    placeholder="0"
                    placeholderTextColor={theme.colors.textFaint}
                    keyboardType="decimal-pad"
                    value={localBudgets[cat] || ''}
                    onChangeText={val => setLocalBudgets(prev => ({ ...prev, [cat]: val }))}
                  />
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveBudgets}>
              <Text style={styles.primaryBtnText}>{t('setBudget')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 40 },
    header: { fontSize: 28, fontWeight: '800', color: theme.colors.text, marginBottom: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textFaint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16, paddingLeft: 4 },
    section: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      ...theme.shadow.card,
    },
    darkModeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    darkModeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    darkModeLabel: { fontSize: 15, color: theme.colors.text },
    inlineLabel: { fontSize: 13, color: theme.colors.textMuted, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
    chipRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 12 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceMuted,
    },
    chipActive: { backgroundColor: theme.colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
    chipTextActive: { color: '#fff' },
    apiKeyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 14,
    },
    apiKeyInput: { flex: 1, fontSize: 14, paddingVertical: 12, color: theme.colors.text },
    apiKeyHint: { fontSize: 11, color: theme.colors.textFaint, marginHorizontal: 16, marginTop: 6 },
    primaryBtn: {
      margin: 16,
      marginTop: 12,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    comingSoonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    comingSoonText: { flex: 1, fontSize: 15 },
    badge: { backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { fontSize: 11, color: theme.colors.textFaint, fontWeight: '600' },
    version: { textAlign: 'center', color: theme.colors.textFaint, fontSize: 12, marginTop: 32 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    aboutIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    aboutTitle: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    privacySection: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 6 },
    privacyText: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 20 },
    catInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
    },
    addCatBtn: {
      backgroundColor: theme.colors.primary,
      width: 46,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    budgetInput: {
      width: 90,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 8,
      fontSize: 14,
      textAlign: 'right',
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
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
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 28,
      alignItems: 'center',
      ...theme.shadow.card,
    },
    emailInput: {
      width: '100%',
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      marginBottom: 20,
    },
    emailCancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: 'center',
    },
    emailSendBtn: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
