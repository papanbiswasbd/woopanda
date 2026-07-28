import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

export default function AnalyticsRedirectScreen() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect cleanly to the upgraded bottom tab Analytics screen
    router.replace('/analytics');
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <ActivityIndicator size="small" color="#3B82F6" />
    </View>
  );
}
