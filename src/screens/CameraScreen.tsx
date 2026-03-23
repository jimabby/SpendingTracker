import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { Transaction } from '../types';
import { CATEGORY_COLORS } from '../constants/categories';
import { AppTheme } from '../constants/theme';
import { scanReceiptWithOcr } from '../utils/ocr';
import { loadPhotos, savePhotos } from '../storage/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_WIDTH - 48) / 3;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { state, dispatch } = useApp();
  const theme = useTheme();
  const t = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const cameraRef = useRef<CameraView>(null);

  // Load persisted photos on mount
  useEffect(() => {
    loadPhotos().then(saved => { if (saved.length > 0) setPhotos(saved); });
  }, []);

  // Persist photos whenever they change
  const updatePhotos = useCallback((updater: (prev: string[]) => string[]) => {
    setPhotos(prev => {
      const next = updater(prev);
      savePhotos(next);
      return next;
    });
  }, []);

  // OCR scanning state
  const [scanningUris, setScanningUris] = useState<Set<string>>(new Set());
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [ocrAmount, setOcrAmount] = useState('');
  const [ocrDate, setOcrDate] = useState('');
  const [ocrMerchant, setOcrMerchant] = useState('');
  const [ocrCategory, setOcrCategory] = useState('');
  const [ocrType, setOcrType] = useState<'expense' | 'income'>('expense');
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  if (!permission) {
    return <View style={styles.center}><Text style={{ color: theme.colors.text }}>{t('loadingCamera')}</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color={theme.colors.textFaint} />
        <Text style={styles.permTitle}>{t('cameraAccessNeeded')}</Text>
        <Text style={styles.permText}>{t('grantCameraPermission')}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t('grantPermission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function openConfirmModal(uri: string, amount = '', date = '', merchant = '', category = '') {
    setPendingPhotoUri(uri);
    setOcrAmount(amount);
    setOcrDate(date);
    setOcrMerchant(merchant);
    setOcrCategory(category);
    setOcrType('expense');
    setConfirmModalVisible(true);
  }

  function resetConfirmModal() {
    setConfirmModalVisible(false);
    setPendingPhotoUri(null);
    setOcrAmount('');
    setOcrDate('');
    setOcrMerchant('');
    setOcrCategory('');
    setOcrType('expense');
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) return;
      const uri = photo.uri;
      updatePhotos(prev => [uri, ...prev]);
      setCameraVisible(false);
      processReceiptPhoto(uri);
    } catch {
      Alert.alert('Error', 'Failed to take picture.');
    }
  }

  function handleSaveTransaction() {
    const parsed = parseFloat(ocrAmount);
    if (!ocrAmount || isNaN(parsed) || parsed <= 0) {
      Alert.alert(t('invalidAmount'), t('enterValidAmount'));
      return;
    }
    if (!ocrCategory) {
      Alert.alert(t('selectCategory'), t('pleaseSelectCategory'));
      return;
    }

    let isoDate = new Date().toISOString();
    if (ocrDate && /^\d{4}-\d{2}-\d{2}$/.test(ocrDate)) {
      isoDate = new Date(ocrDate + 'T00:00:00.000Z').toISOString();
    }

    const tx: Transaction = {
      id: generateId(),
      amount: parsed,
      type: ocrType,
      category: ocrCategory,
      note: ocrMerchant,
      date: isoDate,
      receiptUri: pendingPhotoUri ?? undefined,
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: tx });
    resetConfirmModal();
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    updatePhotos(prev => [uri, ...prev]);
    processReceiptPhoto(uri);
  }

  async function processReceiptPhoto(uri: string) {
    if (!state.aiKey) {
      openConfirmModal(uri);
      return;
    }
    if (state.aiProvider === 'deepseek') {
      Alert.alert('', t('ocrDeepSeekNoVision'));
      openConfirmModal(uri);
      return;
    }
    setScanningUris(prev => new Set(prev).add(uri));
    try {
      const result = await scanReceiptWithOcr(state.aiProvider as any, state.aiKey, uri);
      const validCategory = state.categories.includes(result.category ?? '') ? result.category! : '';
      openConfirmModal(
        uri,
        result.amount !== null ? String(result.amount) : '',
        result.date ?? '',
        result.merchant ?? '',
        validCategory
      );
    } catch (err: any) {
      Alert.alert(t('ocrFailed'), err.message || '');
      openConfirmModal(uri);
    } finally {
      setScanningUris(prev => { const next = new Set(prev); next.delete(uri); return next; });
    }
  }

  function deletePhoto(uri: string) {
    Alert.alert(t('deletePhoto'), t('removePhotoPrompt'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deletePhoto'), style: 'destructive', onPress: () => updatePhotos(prev => prev.filter(p => p !== uri)) },
    ]);
  }

  if (cameraVisible) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCameraVisible(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.shutterBtn} onPress={takePicture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <View style={{ width: 52 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>{t('receiptsHeader')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={() => setCameraVisible(true)}>
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={styles.captureBtnText}>{t('scanReceipt')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={64} color={theme.colors.textFaint} />
          <Text style={styles.emptyText}>{t('noReceiptsYet')}</Text>
          <Text style={styles.emptyHint}>{t('scanReceiptHint')}</Text>
          <TouchableOpacity style={styles.captureBtn2} onPress={() => setCameraVisible(true)}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.captureBtn2Text, { color: theme.colors.primary }]}>{t('openCamera')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => {
            const isScanning = scanningUris.has(item);
            return (
              <TouchableOpacity style={styles.thumb} onPress={() => !isScanning && setPreviewUri(item)} activeOpacity={0.8}>
                <Image source={{ uri: item }} style={styles.thumbImage} />
                {isScanning ? (
                  <View style={[styles.thumbOverlay, styles.thumbScanningOverlay]}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.thumbScanningText}>{t('scanning')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.thumbDeleteBtn}
                    onPress={() => deletePhoto(item)}
                    hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {photos.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity style={styles.fab} onPress={() => setCameraVisible(true)}>
            <Ionicons name="camera" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Photo preview modal */}
      <Modal visible={!!previewUri} animationType="fade" transparent onRequestClose={() => setPreviewUri(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewUri(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.previewActionBtn}
              onPress={() => {
                const uri = previewUri!;
                setPreviewUri(null);
                processReceiptPhoto(uri);
              }}
            >
              <Ionicons name="scan-outline" size={20} color="#fff" />
              <Text style={styles.previewActionText}>{t('scanReceipt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.previewActionBtn, { backgroundColor: 'rgba(255,59,48,0.8)' }]}
              onPress={() => {
                const uri = previewUri!;
                setPreviewUri(null);
                deletePhoto(uri);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.previewActionText}>{t('deletePhoto')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('confirmReceipt')}</Text>
              <TouchableOpacity onPress={resetConfirmModal}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {pendingPhotoUri && (
                <View style={styles.thumbPreviewRow}>
                  <Image source={{ uri: pendingPhotoUri }} style={styles.thumbPreview} />
                  <Text style={styles.scannedHint}>{t('scannedByAi')}</Text>
                </View>
              )}

              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, ocrType === 'expense' && styles.typeBtnExpenseActive]}
                  onPress={() => setOcrType('expense')}
                >
                  <Text style={[styles.typeBtnText, ocrType === 'expense' && styles.typeBtnTextActive]}>
                    {t('expense')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, ocrType === 'income' && styles.typeBtnIncomeActive]}
                  onPress={() => setOcrType('income')}
                >
                  <Text style={[styles.typeBtnText, ocrType === 'income' && styles.typeBtnTextActive]}>
                    {t('incomeType')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput style={styles.input} placeholder={t('amount')} placeholderTextColor={theme.colors.textFaint} keyboardType="decimal-pad" value={ocrAmount} onChangeText={setOcrAmount} />
              <TextInput style={styles.input} placeholder={t('receiptDate')} placeholderTextColor={theme.colors.textFaint} value={ocrDate} onChangeText={setOcrDate} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder={t('merchantNote')} placeholderTextColor={theme.colors.textFaint} value={ocrMerchant} onChangeText={setOcrMerchant} />

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {state.categories.map(cat => {
                  const active = ocrCategory === cat;
                  const color = CATEGORY_COLORS[cat] || theme.colors.primary;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, active && { backgroundColor: color }]}
                      onPress={() => setOcrCategory(cat)}
                    >
                      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTransaction}>
                <Text style={styles.saveBtnText}>{t('saveTransaction')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={resetConfirmModal}>
                <Text style={styles.skipBtnText}>{t('skipReceipt')}</Text>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: theme.colors.background },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      paddingTop: 20,
    },
    header: { fontSize: 28, fontWeight: '800', color: theme.colors.text },
    galleryBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    captureBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    grid: { padding: 16, gap: 4 },
    thumb: { width: THUMB_SIZE, height: THUMB_SIZE, margin: 2, borderRadius: 8, overflow: 'hidden' },
    thumbImage: { width: '100%', height: '100%' },
    thumbOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.15)',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 4,
    },
    thumbScanningOverlay: {
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    thumbScanningText: { fontSize: 10, color: '#fff', fontWeight: '600' },
    thumbDeleteBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 10,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      backgroundColor: theme.colors.primary,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      ...theme.shadow.card,
      zIndex: 10,
    },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyText: { fontSize: 18, fontWeight: '600', color: theme.colors.textMuted, marginTop: 16 },
    emptyHint: { fontSize: 13, color: theme.colors.textFaint, marginTop: 6, textAlign: 'center' },
    captureBtn2: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
    },
    captureBtn2Text: { fontWeight: '600', fontSize: 15 },
    permTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginTop: 16 },
    permText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8 },
    permBtn: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 20,
      marginTop: 24,
    },
    permBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    cameraContainer: { flex: 1 },
    camera: { flex: 1 },
    cameraControls: {
      position: 'absolute',
      bottom: 40,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
    },
    cancelBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 4,
      borderColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      maxHeight: '90%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    thumbPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    thumbPreview: { width: 72, height: 72, borderRadius: 10 },
    scannedHint: { fontSize: 12, color: theme.colors.textFaint, flex: 1 },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    typeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    typeBtnExpenseActive: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
    typeBtnIncomeActive: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
    typeBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
    typeBtnTextActive: { color: '#fff' },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      marginBottom: 12,
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
    },
    inputLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8 },
    categoryRow: { marginBottom: 16 },
    catChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surfaceMuted,
      marginRight: 8,
    },
    catChipText: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted },
    catChipTextActive: { color: '#fff' },
    saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    skipBtn: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      marginBottom: 8,
    },
    skipBtnText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '600' },
    previewOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewCloseBtn: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewImage: {
      width: SCREEN_WIDTH - 32,
      height: SCREEN_WIDTH - 32,
      borderRadius: 12,
    },
    previewActions: {
      flexDirection: 'row',
      gap: 16,
      position: 'absolute',
      bottom: 60,
    },
    previewActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 24,
    },
    previewActionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  });
}
