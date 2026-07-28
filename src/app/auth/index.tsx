import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../shared/store/authStore';

export default function AuthIndexRedirect() {
  const router = useRouter();
  const { isUserLoggedIn, isStoreConnected } = useAuthStore();

  useEffect(() => {
    if (!isUserLoggedIn) {
      router.replace('/auth/login');
    } else if (!isStoreConnected) {
      router.replace('/auth/connect');
    } else {
      router.replace('/(tabs)');
    }
  }, [isUserLoggedIn, isStoreConnected, router]);

  return (
    <View className="flex-1 items-center justify-center bg-slate-950">
      <ActivityIndicator size="small" color="#3B82F6" />
    </View>
  );
}
