import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from './src/context/AppContext';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import AIScreen from './src/screens/AIScreen';
import { theme } from './src/constants/theme';
import {
  setupNotificationChannel,
  setupBudgetNotificationChannel,
  checkBudgetNotifications,
} from './src/notifications/notifications';

function AppInner() {
  const [aiVisible, setAiVisible] = useState(false);
  const { state } = useApp();
  const initializedRef = useRef(false);

  // Setup notification channels once
  useEffect(() => {
    setupNotificationChannel();
    setupBudgetNotificationChannel();
  }, []);

  // Check budget thresholds whenever transactions or budgets change (skip on first load)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (Object.keys(state.budgets).length === 0) return;
    checkBudgetNotifications(state.transactions, state.budgets, state.currency);
  }, [state.transactions, state.budgets]);

  return (
    <View style={styles.container}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <BottomTabNavigator />
      </NavigationContainer>

      <TouchableOpacity style={styles.fab} onPress={() => setAiVisible(true)}>
        <Ionicons name="sparkles" size={24} color="#fff" />
      </TouchableOpacity>

      <AIScreen visible={aiVisible} onClose={() => setAiVisible(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.card,
  },
});
