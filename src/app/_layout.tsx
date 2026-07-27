import '../global.css';
import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAuthStore } from '../shared/store/authStore';
import { bootstrapDatabase } from '../shared/database/db';

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
  
  const { isAuthenticated, isLoading, loadStoredCredentials } = useAuthStore();

  // 1. Bootstrap database tables and load stored auth keychains on startup
  useEffect(() => {
    async function initApp() {
      try {
        bootstrapDatabase();
        await loadStoredCredentials();
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    }
    initApp();
  }, []);

  // 2. Manage Auth Routing Redirection
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const isAtRoot = !segments[0] || segments[0] === '';

    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        if (!inAuthGroup) {
          // Redirect to authentication screen if trying to access private screens
          router.replace('/auth');
        }
      } else {
        if (inAuthGroup || isAtRoot) {
          // Redirect to main tabs if authenticated and sitting on login or root screen
          router.replace('/(tabs)');
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, segments]);

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
