import '../global.css';
import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator, LogBox } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';

import { useAuthStore } from '../shared/store/authStore';
import { bootstrapDatabase } from '../shared/database/db';
import OrderNotification from '../shared/components/OrderNotification';
import { firebaseAuthService } from '../shared/services/firebase/authService';

// Suppress known Expo Go error log about remote push notifications (we only use local notifications which work fine)
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
  'Android Push notifications (remote notifications)',
]);

// Configure how notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Keep the splash screen visible while bootstrapping
SplashScreen.preventAutoHideAsync().catch(() => {});

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  
  const { isUserLoggedIn, isStoreConnected, isAuthenticated, isLoading, loadStoredCredentials, setFirebaseUser } = useAuthStore();

  // 1. Bootstrap database tables, initialize Firebase auth listener, and load stored credentials
  useEffect(() => {
    let unsubscribe: () => void;
    async function initApp() {
      try {
        bootstrapDatabase();
        await loadStoredCredentials();
        
        // Listen to Firebase real-time authentication session changes
        unsubscribe = firebaseAuthService.subscribeToAuthChanges(async (user) => {
          await setFirebaseUser(user);
          await SplashScreen.hideAsync().catch(() => {});
        });
        
        // Request Notification Permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('Failed to get push token for push notification!');
        }
      } catch (error) {
        console.error('Initialization error:', error);
        await SplashScreen.hideAsync().catch(() => {});
      }
    }
    initApp();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // 2. Manage 2-Step Auth Onboarding & Dashboard Routing
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const isAtRoot = !segments[0] || segments[0] === '';

    const timer = setTimeout(() => {
      if (!isUserLoggedIn) {
        // Step 1: User must sign in or register with Firebase account first
        if ((segments as string[])[1] !== 'login') {
          router.replace('/auth/login');
        }
      } else if (!isStoreConnected) {
        // Step 2: User logged in, but NO store connected (and none recovered from Firestore cloud)
        if ((segments as string[])[1] !== 'connect') {
          router.replace('/auth/connect');
        }
      } else {
        // Fully authenticated (Firebase account active + WooCommerce store connected)
        if (inAuthGroup || isAtRoot) {
          router.replace('/(tabs)');
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isUserLoggedIn, isStoreConnected, isLoading, segments]);

  // 3. Listen for OS Notification Taps to Navigate to Order Details
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    if (
      lastNotificationResponse &&
      lastNotificationResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const data = lastNotificationResponse.notification.request.content.data;
      if (data?.orderId) {
        router.push(`/orders/${data.orderId}`);
      } else if (data?.url && typeof data.url === 'string') {
        router.push(data.url as any);
      }
    }
  }, [lastNotificationResponse, isLoading, isAuthenticated]);

  // Loading state overlay (if splash is hidden but state is loading)
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={DefaultTheme}>
        <OrderNotification />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="products/[id]" options={{ presentation: 'card', headerShown: true, title: 'Edit Product' }} />
          <Stack.Screen name="products/create" options={{ presentation: 'card', headerShown: true, title: 'Create Product' }} />
          <Stack.Screen name="products/scanner" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="orders/[id]" options={{ presentation: 'card', headerShown: true, title: 'Order Details' }} />
          <Stack.Screen name="customers/[id]" options={{ presentation: 'card', headerShown: true, title: 'Customer Details' }} />
          <Stack.Screen name="analytics/index" options={{ presentation: 'card', headerShown: true, title: 'Analytics' }} />
          <Stack.Screen name="inventory/index" options={{ presentation: 'card', headerShown: true, title: 'Inventory Stock' }} />
          <Stack.Screen name="coupons/index" options={{ presentation: 'card', headerShown: true, title: 'Coupons' }} />
          <Stack.Screen name="reviews/index" options={{ presentation: 'card', headerShown: true, title: 'Moderating Reviews' }} />
          <Stack.Screen name="settings/index" options={{ presentation: 'card', headerShown: true, title: 'App Settings' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
