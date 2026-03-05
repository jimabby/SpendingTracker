import React, { useState, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Transaction } from '../types';
import { CATEGORY_COLORS } from '../constants/categories';
import { scanReceiptWithOcr } from '../utils/ocr';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_WIDTH - 48) / 3;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { state, dispatch } = useApp();
  const t = useTranslation();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const cameraRef = useRef<CameraView>(null);

  // OCR scanning state
  const [scanningUris, setScanningUris] = useState<Set<string>>(new Set());
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [ocrAmount, setOcrAmount] = useState('');
  const [ocrDate, setOcrDate] = useState('');
  const [ocrMerchant, setOcrMerchant] = useState('');
  const [ocrCategory, setOcrCategory] = useState('');
  const [ocrType, setOcrType] = useState<'expense' | 'income'>('expense');

  if (!permission) {
    return <View style={styles.center}><Text>{t('loadingCamera')}</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color="#B2BEC3" />
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

      setPhotos(prev => [uri, ...prev]);
      setCameraVisible(false);

      // No API key → open blank form
      if (!state.aiKey) {
        openConfirmModal(uri);
        return;
      }

      // DeepSeek has no vision → alert + open blank form
      if (state.aiProvider === 'deepseek') {
        Alert.alert('', t('ocrDeepSeekNoVision'));
        openConfirmModal(uri);
        return;
      }

      // OCR with spinner
      setScanningUris(prev => new Set(prev).add(uri));
      try {
        const result = await scanReceiptWithOcr(state.aiProvider as any, state.aiKey, uri);
        const validCategory = state.categories.includes(result.category ?? '')
          ? result.category!
          : '';
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

  function deletePhoto(uri: string) {
    Alert.alert(t('deletePhoto'), t('removePhotoPrompt'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deletePhoto'), style: 'destructive', onPress: () => setPhotos(prev => prev.filter(p => p !== uri)) },
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
        <TouchableOpacity style={styles.captureBtn} onPress={() => setCameraVisible(true)}>
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.captureBtnText}>{t('scanReceipt')}</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={64} color="#B2BEC3" />
          <Text style={styles.emptyText}>{t('noReceiptsYet')}</Text>
          <Text style={styles.emptyHint}>{t('scanReceiptHint')}</Text>
          <TouchableOpacity style={styles.captureBtn2} onPress={() => setCameraVisible(true)}>
            <Ionicons name="camera-outline" size={20} color="#6C5CE7" />
            <Text style={styles.captureBtn2Text}>{t('openCamera')}</Text>
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
              <View style={styles.thumb}>
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
              </View>
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

      {/* Receipt Confirmation Modal */}
      <Modal visible={confirmModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('confirmReceipt')}</Text>
              <TouchableOpacity onPress={resetConfirmModal}>
                <Ionicons name="close" size={24} color="#636E72" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {pendingPhotoUri && (
                <View style={styles.thumbPreviewRow}>
                  <Image source={{ uri: pendingPhotoUri }} style={styles.thumbPreview} />
                  <Text style={styles.scannedHint}>{t('scannedByAi')}</Text>
                </View>
              )}

              {/* Type toggle */}
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

              <TextInput
                style={styles.input}
                placeholder={t('amount')}
                keyboardType="decimal-pad"
                value={ocrAmount}
                onChangeText={setOcrAmount}
              />
              <TextInput
                style={styles.input}
                placeholder={t('receiptDate')}
                value={ocrDate}
                onChangeText={setOcrDate}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder={t('merchantNote')}
                value={ocrMerchant}
                onChangeText={setOcrMerchant}
              />

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {state.categories.map(cat => {
                  const active = ocrCategory === cat;
                  const color = CATEGORY_COLORS[cat] || '#6C5CE7';
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F8F9FA' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 20,
  },
  header: { fontSize: 28, fontWeight: '700', color: '#2D3436' },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6C5CE7',
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
    backgroundColor: '#6C5CE7',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#636E72', marginTop: 16 },
  emptyHint: { fontSize: 13, color: '#B2BEC3', marginTop: 6, textAlign: 'center' },
  captureBtn2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: '#6C5CE7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  captureBtn2Text: { color: '#6C5CE7', fontWeight: '600', fontSize: 15 },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#2D3436', marginTop: 16 },
  permText: { fontSize: 14, color: '#636E72', textAlign: 'center', marginTop: 8 },
  permBtn: {
    backgroundColor: '#6C5CE7',
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
  // Confirm modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2D3436' },
  thumbPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  thumbPreview: { width: 72, height: 72, borderRadius: 10 },
  scannedHint: { fontSize: 12, color: '#B2BEC3', flex: 1 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DFE6E9',
    alignItems: 'center',
  },
  typeBtnExpenseActive: { backgroundColor: '#D63031', borderColor: '#D63031' },
  typeBtnIncomeActive: { backgroundColor: '#00B894', borderColor: '#00B894' },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: '#636E72' },
  typeBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#636E72', marginBottom: 8 },
  categoryRow: { marginBottom: 16 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F5',
    marginRight: 8,
  },
  catChipText: { fontSize: 13, fontWeight: '500', color: '#636E72' },
  catChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#6C5CE7', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: {
    borderWidth: 1,
    borderColor: '#DFE6E9',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  skipBtnText: { fontSize: 15, color: '#636E72', fontWeight: '600' },
});
