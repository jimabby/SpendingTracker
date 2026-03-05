import React, { useState, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { sendAIMessageWithTools, ChatMessage, AIProvider } from '../utils/ai';
import { TOOL_DEFINITIONS, executeToolCall } from '../utils/aiTools';
import { translations } from '../i18n/translations';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

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

function buildContext(state: ReturnType<typeof useApp>['state']): string {
  const { transactions, cards, currency } = state;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const thisMonth = transactions.filter(t =>
    isWithinInterval(new Date(t.date), { start: monthStart, end: monthEnd })
  );

  const totalIncome = thisMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = thisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const categoryMap: Record<string, number> = {};
  thisMonth.filter(t => t.type === 'expense').forEach(t => {
    categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
  });

  const topCategories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, amount]) => `${cat}: ${amount.toFixed(2)} ${currency}`)
    .join(', ') || 'No expenses yet';

  const txList = transactions.slice(0, 30).map(t =>
    `[id:${t.id}] ${t.date.slice(0, 10)} | ${t.type} | ${t.amount.toFixed(2)} ${currency} | ${t.category}${t.note ? ' | ' + t.note : ''}`
  ).join('\n') || 'No transactions yet';

  const cardList = cards.map(c =>
    `[id:${c.id}] ${c.name} | ···· ${c.lastFour} | due: ${c.dueDate}`
  ).join('\n') || 'No cards';

  const lang = (state.language === 'zh' ? 'zh' : 'en') as 'en' | 'zh';
  const langInstruction = translations[lang].aiLanguageInstruction;

  return `You are Pockyt, a friendly AI financial assistant built into the Pockyt spending tracker app. Be concise, helpful, and encouraging. You can perform actions like adding/deleting transactions and cards, changing the app language, or sending a CSV export by email — use the available tools when the user asks you to. ${langInstruction}

Current month: ${format(now, 'MMMM yyyy')}
Currency: ${currency}
This month's income: ${totalIncome.toFixed(2)} ${currency}
This month's expenses: ${totalExpense.toFixed(2)} ${currency}
Net balance: ${(totalIncome - totalExpense).toFixed(2)} ${currency}
Top spending categories: ${topCategories}
Total transactions in history: ${transactions.length}

Transactions (use IDs for delete_transaction, most recent first):
${txList}

Cards (use IDs for delete_card):
${cardList}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AIScreen({ visible, onClose }: Props) {
  const { state, dispatch } = useApp();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
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
      const filePath = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + fileName;
      await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await MailComposer.composeAsync({
        recipients: [email],
        subject: 'Pockyt Transactions Export',
        body: 'Please find your Pockyt transaction history attached.',
        attachments: [filePath],
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
            <Ionicons name="close" size={22} color="#636E72" />
          </TouchableOpacity>
        </View>

        {!apiKey && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color="#E17055" />
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
                  <Ionicons name="sparkles" size={32} color="#6C5CE7" />
                </View>
                <Text style={styles.welcomeTitle}>{t('hiImPockyt')}</Text>
                <Text style={styles.welcomeText}>{t('welcomeText')}</Text>
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
                      <Ionicons name="sparkles" size={13} color="#6C5CE7" />
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
                          <Ionicons name="checkmark-circle" size={14} color="#00B894" />
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
                  <Ionicons name="sparkles" size={13} color="#6C5CE7" />
                </View>
                <View style={[styles.msgBubble, styles.msgBubbleAI, { paddingHorizontal: 20 }]}>
                  <ActivityIndicator size="small" color="#6C5CE7" />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder={t('askAnything')}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F5',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#2D3436' },
  headerSub: { fontSize: 12, color: '#B2BEC3', marginTop: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3F0',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FEDDDD',
  },
  warningText: { flex: 1, fontSize: 13, color: '#E17055' },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  welcomeContainer: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8 },
  welcomeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEE9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  welcomeTitle: { fontSize: 22, fontWeight: '700', color: '#2D3436', marginBottom: 8 },
  welcomeText: { fontSize: 14, color: '#636E72', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  quickQuestions: { width: '100%', gap: 8 },
  quickChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 14,
  },
  quickChipText: { fontSize: 14, color: '#2D3436' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI: { justifyContent: 'flex-start' },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEE9FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgBubble: { maxWidth: '78%', borderRadius: 18, padding: 12, paddingHorizontal: 14 },
  msgBubbleUser: { backgroundColor: '#6C5CE7', borderBottomRightRadius: 4 },
  msgBubbleAI: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTextUser: { color: '#fff' },
  msgTextAI: { color: '#2D3436' },
  actionsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 2, marginBottom: 4 },
  actionsAvatarSpacer: { width: 28, flexShrink: 0 },
  actionsBubble: {
    backgroundColor: '#EAFFEA',
    borderWidth: 1,
    borderColor: '#B2DFDB',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
    maxWidth: '78%',
  },
  actionLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, color: '#00B894', flex: 1 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F5',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#F8F9FA',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#B2BEC3' },
});
