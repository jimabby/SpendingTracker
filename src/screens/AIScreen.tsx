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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { sendAIMessage, ChatMessage, AIProvider } from '../utils/ai';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

const QUICK_QUESTIONS = [
  'How much did I spend this month?',
  'Where am I overspending?',
  'Give me budgeting tips',
  'Analyze my spending habits',
];

const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function buildContext(state: ReturnType<typeof useApp>['state']): string {
  const { transactions, currency } = state;
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

  const categoryMap: Record<string, number> = {};
  thisMonth
    .filter(t => t.type === 'expense')
    .forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });

  const topCategories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, amount]) => `${cat}: ${amount.toFixed(2)} ${currency}`)
    .join(', ') || 'No expenses yet';

  const recentTxs = transactions
    .slice(0, 5)
    .map(t =>
      `${t.date.slice(0, 10)} ${t.type === 'expense' ? '-' : '+'}${t.amount} ${currency} (${t.category}${t.note ? ', ' + t.note : ''})`
    )
    .join('\n') || 'No transactions yet';

  return `You are Pockyt, a friendly AI financial assistant built into the Pockyt spending tracker app. Be concise, helpful, and encouraging. Use the user's actual spending data to give personalized advice. Keep responses short and clear.

Current month: ${format(now, 'MMMM yyyy')}
Currency: ${currency}
This month's income: ${totalIncome.toFixed(2)} ${currency}
This month's expenses: ${totalExpense.toFixed(2)} ${currency}
Net balance: ${(totalIncome - totalExpense).toFixed(2)} ${currency}
Top spending categories: ${topCategories}
Recent transactions:
${recentTxs}
Total transactions in history: ${transactions.length}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AIScreen({ visible, onClose }: Props) {
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const provider = (state.aiProvider || 'chatgpt') as AIProvider;
  const apiKey = state.aiKey || '';

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const systemPrompt = buildContext(state);
      const reply = await sendAIMessage(provider, apiKey, newMessages, systemPrompt);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to get a response. Check your API key in Settings.');
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
              <Text style={styles.headerSub}>{PROVIDER_LABELS[provider]} · Your financial assistant</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#636E72" />
          </TouchableOpacity>
        </View>

        {!apiKey && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color="#E17055" />
            <Text style={styles.warningText}>Add your API key in Settings → AI Assistant to chat</Text>
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
                <Text style={styles.welcomeTitle}>Hi! I'm Pockyt AI</Text>
                <Text style={styles.welcomeText}>
                  I have access to your spending data and can help you understand your finances, find savings, and build better habits.
                </Text>
                <View style={styles.quickQuestions}>
                  {QUICK_QUESTIONS.map(q => (
                    <TouchableOpacity key={q} style={styles.quickChip} onPress={() => sendMessage(q)}>
                      <Text style={styles.quickChipText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {messages.map((msg, i) => (
              <View
                key={i}
                style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowAI]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.msgAvatar}>
                    <Ionicons name="sparkles" size={13} color="#6C5CE7" />
                  </View>
                )}
                <View
                  style={[
                    styles.msgBubble,
                    msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAI,
                  ]}
                >
                  <Text style={[styles.msgText, msg.role === 'user' ? styles.msgTextUser : styles.msgTextAI]}>
                    {msg.content}
                  </Text>
                </View>
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
              placeholder="Ask Pockyt AI anything..."
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
  welcomeText: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
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
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
  },
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
  msgBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 14,
  },
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
