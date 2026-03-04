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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_WIDTH - 48) / 3;

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View style={styles.center}><Text>Loading camera...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color="#B2BEC3" />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permText}>Grant camera permission to capture receipts.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setPhotos(prev => [photo.uri, ...prev]);
        setCameraVisible(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to take picture.');
    }
  }

  function deletePhoto(uri: string) {
    Alert.alert('Delete', 'Remove this receipt photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setPhotos(prev => prev.filter(p => p !== uri)) },
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
        <Text style={styles.header}>Receipts</Text>
        <TouchableOpacity style={styles.captureBtn} onPress={() => setCameraVisible(true)}>
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.captureBtnText}>Scan Receipt</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={64} color="#B2BEC3" />
          <Text style={styles.emptyText}>No receipts yet</Text>
          <Text style={styles.emptyHint}>Tap "Scan Receipt" to capture a receipt photo</Text>
          <TouchableOpacity style={styles.captureBtn2} onPress={() => setCameraVisible(true)}>
            <Ionicons name="camera-outline" size={20} color="#6C5CE7" />
            <Text style={styles.captureBtn2Text}>Open Camera</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity onLongPress={() => deletePhoto(item)} style={styles.thumb}>
              <Image source={{ uri: item }} style={styles.thumbImage} />
              <View style={styles.thumbOverlay}>
                <Ionicons name="expand-outline" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {photos.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => setCameraVisible(true)}>
          <Ionicons name="camera" size={28} color="#fff" />
        </TouchableOpacity>
      )}
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
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
});
