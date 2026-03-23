import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { Goal } from '../types';
import { AppTheme } from '../constants/theme';
import { differenceInCalendarDays } from 'date-fns';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const GOAL_COLORS = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#FDCB6E', '#E84393'];
const GOAL_ICONS = ['trophy', 'airplane', 'home', 'phone-portrait', 'car', 'school', 'medkit', 'gift', 'diamond', 'heart'];

function ProgressBar({ pct, color, theme }: { pct: number; color: string; theme: AppTheme }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={{ height: 8, backgroundColor: theme.colors.surfaceMuted, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
      <View style={{ height: 8, borderRadius: 4, width: `${clamped}%` as any, backgroundColor: color }} />
    </View>
  );
}

function GoalCard({
  goal,
  currency,
  locale,
  t,
  theme,
  styles,
  onEdit,
  onDelete,
  onAddSavings,
}: {
  goal: Goal;
  currency: string;
  locale: string;
  t: (key: any) => any;
  theme: AppTheme;
  styles: any;
  onEdit: (g: Goal) => void;
  onDelete: (id: string) => void;
  onAddSavings: (g: Goal) => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);

  const pct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
  const completed = pct >= 100;
  const color = goal.color || GOAL_COLORS[0];

  let deadlineText: string | null = null;
  let deadlineUrgent = false;
  if (goal.deadline) {
    const days = differenceInCalendarDays(new Date(goal.deadline), new Date());
    if (days < 0) {
      deadlineText = t('goalOverdue');
      deadlineUrgent = true;
    } else if (days === 0) {
      deadlineText = t('goalDueToday');
      deadlineUrgent = true;
    } else if (days <= 30) {
      deadlineText = `${days}d left`;
      deadlineUrgent = days <= 7;
    } else {
      const months = Math.round(days / 30);
      deadlineText = `${months}mo left`;
    }
  }

  return (
    <View style={[styles.goalCard, completed && styles.goalCardComplete]}>
      <View style={[styles.goalColorBar, { backgroundColor: color }]} />
      <View style={styles.goalContent}>
        <View style={styles.goalHeader}>
          <View style={[styles.goalIconWrap, { backgroundColor: color + '22' }]}>
            <Ionicons name={(goal.icon || 'trophy') as any} size={18} color={color} />
          </View>
          <View style={styles.goalTitleWrap}>
            <Text style={styles.goalTitle} numberOfLines={1}>{goal.title}</Text>
            {deadlineText && (
              <Text style={[styles.goalDeadline, deadlineUrgent && { color: theme.colors.danger }]}>
                {deadlineText}
              </Text>
            )}
          </View>
          {completed && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
              <Text style={[styles.completedText, { color: theme.colors.success }]}>{t('goalCompleted')}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => onEdit(goal)} style={styles.iconBtn}>
            <Ionicons name="pencil-outline" size={16} color={theme.colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(goal.id)} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.textFaint} />
          </TouchableOpacity>
        </View>

        <ProgressBar pct={pct} color={color} theme={theme} />

        <View style={styles.goalAmounts}>
          <Text style={styles.savedAmt}>{fmt(goal.savedAmount)}</Text>
          <Text style={styles.pctText}>{Math.round(pct)}%</Text>
          <Text style={styles.targetAmt}>{fmt(goal.targetAmount)}</Text>
        </View>

        {!completed && (
          <TouchableOpacity style={[styles.addSavingsBtn, { borderColor: color }]} onPress={() => onAddSavings(goal)}>
            <Ionicons name="add-circle-outline" size={14} color={color} />
            <Text style={[styles.addSavingsBtnText, { color }]}>{t('addSavings')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GoalsScreen({ visible, onClose }: Props) {
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const goals = state.goals || [];
  const currency = state.currency;
  const locale = state.language === 'zh' ? 'zh-CN' : 'en-US';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [formVisible, setFormVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedColor, setSelectedColor] = useState(GOAL_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(GOAL_ICONS[0]);

  // Quick add-savings modal
  const [savingsGoal, setSavingsGoal] = useState<Goal | null>(null);
  const [savingsAmount, setSavingsAmount] = useState('');

  function resetForm() {
    setTitle('');
    setTargetAmount('');
    setSavedAmount('');
    setDeadline('');
    setSelectedColor(GOAL_COLORS[0]);
    setSelectedIcon(GOAL_ICONS[0]);
    setEditingGoal(null);
    setFormVisible(false);
  }

  function openEdit(g: Goal) {
    setEditingGoal(g);
    setTitle(g.title);
    setTargetAmount(String(g.targetAmount));
    setSavedAmount(String(g.savedAmount));
    setDeadline(g.deadline || '');
    setSelectedColor(g.color || GOAL_COLORS[0]);
    setSelectedIcon(g.icon || GOAL_ICONS[0]);
    setFormVisible(true);
  }

  function handleSave() {
    const target = parseFloat(targetAmount);
    if (!title.trim()) {
      Alert.alert(t('titleRequired'), t('pleaseEnterGoalName'));
      return;
    }
    if (!target || target <= 0) {
      Alert.alert(t('invalidAmount'), t('pleaseEnterValidTarget'));
      return;
    }
    const saved = parseFloat(savedAmount) || 0;

    const goal: Goal = {
      id: editingGoal?.id || generateId(),
      title: title.trim(),
      targetAmount: target,
      savedAmount: saved,
      deadline: deadline.trim() || undefined,
      color: selectedColor,
      icon: selectedIcon,
    };

    if (editingGoal) {
      dispatch({ type: 'UPDATE_GOAL', payload: goal });
    } else {
      dispatch({ type: 'ADD_GOAL', payload: goal });
    }
    resetForm();
  }

  function handleDelete(id: string) {
    Alert.alert(t('delete'), t('removeGoal'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => dispatch({ type: 'DELETE_GOAL', payload: id }) },
    ]);
  }

  function handleAddSavings() {
    if (!savingsGoal) return;
    const add = parseFloat(savingsAmount);
    if (!add || add <= 0) {
      Alert.alert(t('invalidAmount'), t('pleaseEnterValidAmount'));
      return;
    }
    const updated: Goal = {
      ...savingsGoal,
      savedAmount: savingsGoal.savedAmount + add,
    };
    dispatch({ type: 'UPDATE_GOAL', payload: updated });
    setSavingsGoal(null);
    setSavingsAmount('');
  }

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const completedCount = goals.filter(g => g.savedAmount >= g.targetAmount).length;

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('goals')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Summary row */}
          {goals.length > 0 && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{fmt(totalSaved)}</Text>
                <Text style={styles.summaryLabel}>{t('goalSummSaved')}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{fmt(totalTarget)}</Text>
                <Text style={styles.summaryLabel}>{t('goalSummTarget')}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: theme.colors.success }]}>{completedCount}</Text>
                <Text style={styles.summaryLabel}>{t('goalSummCompleted')}</Text>
              </View>
            </View>
          )}

          <ScrollView style={styles.list} contentContainerStyle={goals.length === 0 ? styles.emptyContainer : { padding: 16, gap: 12 }}>
            {goals.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="trophy-outline" size={52} color={theme.colors.textFaint} />
                <Text style={styles.emptyTitle}>{t('noGoalsYet')}</Text>
                <Text style={styles.emptyHint}>{t('noGoalsHint')}</Text>
              </View>
            ) : (
              goals.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  currency={currency}
                  locale={locale}
                  t={t}
                  theme={theme}
                  styles={styles}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onAddSavings={(goal) => { setSavingsGoal(goal); setSavingsAmount(''); }}
                />
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setFormVisible(true); }}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>{t('newGoal')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add/Edit form modal */}
      <Modal visible={formVisible} animationType="slide" transparent onRequestClose={resetForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={styles.formSheet}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{editingGoal ? t('editGoal') : t('newGoal')}</Text>
              <TouchableOpacity onPress={resetForm}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.input}
                placeholder={t('goalNamePlaceholder')}
                value={title}
                onChangeText={setTitle}
                placeholderTextColor={theme.colors.textFaint}
              />
              <TextInput
                style={styles.input}
                placeholder={t('goalTargetPlaceholder')}
                keyboardType="decimal-pad"
                value={targetAmount}
                onChangeText={setTargetAmount}
                placeholderTextColor={theme.colors.textFaint}
              />
              <TextInput
                style={styles.input}
                placeholder={t('goalSavedPlaceholder')}
                keyboardType="decimal-pad"
                value={savedAmount}
                onChangeText={setSavedAmount}
                placeholderTextColor={theme.colors.textFaint}
              />
              <TextInput
                style={styles.input}
                placeholder={t('goalDeadlinePlaceholder')}
                value={deadline}
                onChangeText={setDeadline}
                placeholderTextColor={theme.colors.textFaint}
              />

              <Text style={styles.sectionLabel}>{t('goalColor')}</Text>
              <View style={styles.colorRow}>
                {GOAL_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, selectedColor === c && styles.colorDotSelected]}
                    onPress={() => setSelectedColor(c)}
                  />
                ))}
              </View>

              <Text style={styles.sectionLabel}>{t('goalIcon')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {GOAL_ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    style={[styles.iconChip, selectedIcon === icon && { backgroundColor: selectedColor }]}
                    onPress={() => setSelectedIcon(icon)}
                  >
                    <Ionicons
                      name={icon as any}
                      size={20}
                      color={selectedIcon === icon ? '#fff' : theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{editingGoal ? t('updateGoal') : t('createGoal')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Quick add-savings modal */}
      {savingsGoal && (
        <Modal visible={!!savingsGoal} animationType="fade" transparent onRequestClose={() => setSavingsGoal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.savingsOverlay}>
            <View style={styles.savingsSheet}>
              <Text style={styles.savingsTitle}>{t('addTo')(savingsGoal.title)}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('amountToAdd')}
                keyboardType="decimal-pad"
                value={savingsAmount}
                onChangeText={setSavingsAmount}
                autoFocus
                placeholderTextColor={theme.colors.textFaint}
              />
              <View style={styles.savingsButtons}>
                <TouchableOpacity style={styles.savingsCancelBtn} onPress={() => setSavingsGoal(null)}>
                  <Text style={styles.savingsCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.savingsConfirmBtn} onPress={handleAddSavings}>
                  <Text style={styles.savingsConfirmText}>{t('addSavings')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      paddingBottom: 24,
    },
    formSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      maxHeight: '90%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
    closeBtn: { padding: 4 },
    summaryRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      borderRadius: theme.radius.lg,
      padding: 16,
      marginBottom: 4,
      ...theme.shadow.card,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
    summaryLabel: { fontSize: 11, color: theme.colors.textFaint, marginTop: 2 },
    summaryDivider: { width: 1, backgroundColor: theme.colors.border },
    list: { flex: 1 },
    emptyContainer: { flex: 1, justifyContent: 'center' },
    empty: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.textMuted, marginTop: 14 },
    emptyHint: { fontSize: 13, color: theme.colors.textFaint, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
    goalCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      flexDirection: 'row',
      overflow: 'hidden',
      ...theme.shadow.card,
    },
    goalCardComplete: { opacity: 0.85 },
    goalColorBar: { width: 5 },
    goalContent: { flex: 1, padding: 14 },
    goalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    goalIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    goalTitleWrap: { flex: 1 },
    goalTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    goalDeadline: { fontSize: 11, color: theme.colors.textFaint, marginTop: 1 },
    completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    completedText: { fontSize: 12, fontWeight: '600' },
    iconBtn: { padding: 6 },
    goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    savedAmt: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
    pctText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
    targetAmt: { fontSize: 13, color: theme.colors.textFaint },
    addSavingsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    addSavingsBtnText: { fontSize: 12, fontWeight: '600' },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.colors.primary,
      marginHorizontal: 16,
      borderRadius: 14,
      padding: 16,
    },
    addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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
    sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 10 },
    colorRow: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
    colorDot: { width: 32, height: 32, borderRadius: 16 },
    colorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
    iconChip: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
      marginRight: 8,
    },
    saveBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 8,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    savingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
    savingsSheet: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 24,
      ...theme.shadow.card,
    },
    savingsTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
    savingsButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
    savingsCancelBtn: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    savingsCancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
    savingsConfirmBtn: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
    },
    savingsConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
