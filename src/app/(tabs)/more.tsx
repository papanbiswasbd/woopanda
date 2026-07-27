import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../shared/store/authStore';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { syncService } from '../../shared/services/syncService';
import { 
  BarChart3, AlertTriangle, Ticket, MessageSquare, 
  Settings, LogOut, RefreshCw, Globe, ChevronRight, Key, ShieldAlert 
} from 'lucide-react-native';

export default function MoreHubScreen() {
  const router = useRouter();
  const { credentials, logout } = useAuthStore();
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Load pending queue length from SQLite
  const loadQueueLength = useCallback(async () => {
    try {
      const count = await syncQueueService.getPendingCount();
      setPendingQueueCount(count);
    } catch (error) {
      console.error('Failed to get sync queue count:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQueueLength();
    }, [loadQueueLength])
  );

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncService.syncAll();
      await loadQueueLength();
      Alert.alert('Sync Complete', 'WooPanda database cache is now up-to-date.');
    } catch {
      Alert.alert('Sync Failed', 'Failed to synchronize with WooCommerce.');
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout and clear all local API credentials?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          }
        }
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. WooCommerce Store Meta Information */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 flex-row gap-4 items-center">
        <View className="w-12 h-12 bg-blue-600/10 rounded-2xl items-center justify-center border border-blue-500/20">
          <Globe size={22} color="#3B82F6" />
        </View>
        <View className="flex-1">
          <Text className="text-slate-900 font-extrabold text-sm" numberOfLines={1}>
            {credentials?.siteUrl?.replace(/^https?:\/\//, '')}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1.5">
            <Key size={10} color="#64748B" />
            <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
              Method: {credentials?.authMethod?.replace('_', ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Offline Synchronization Queue Status */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-slate-900 font-bold text-sm">Offline Sync Engine</Text>
            {pendingQueueCount > 0 ? (
              <Text className="text-amber-400 text-xs mt-1 font-semibold flex-row items-center gap-1">
                {pendingQueueCount} modifications queued to upload
              </Text>
            ) : (
              <Text className="text-slate-500 text-xs mt-1 font-medium">
                No pending offline edits. All synchronized.
              </Text>
            )}
          </View>
          
          <Pressable 
            onPress={handleSyncNow}
            disabled={syncing}
            className={`h-9 px-4 rounded-xl flex-row items-center justify-center gap-1.5 ${
              syncing ? 'bg-blue-800' : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={14} color="#FFFFFF" />
                <Text className="text-slate-900 font-bold text-xs">Sync Now</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* 3. Operational Features List */}
      <View className="bg-white border border-slate-200 rounded-3xl p-4 mb-5 gap-0.5">
        
        {/* Analytics Item */}
        <Pressable 
          onPress={() => router.push('/analytics/index')}
          className="flex-row justify-between items-center p-3 rounded-2xl active:bg-slate-150"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-blue-500/10 p-2.5 rounded-xl">
              <BarChart3 size={18} color="#3B82F6" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Detailed Analytics</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Inventory Item */}
        <Pressable 
          onPress={() => router.push('/inventory/index')}
          className="flex-row justify-between items-center p-3 rounded-2xl active:bg-slate-150"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-amber-500/10 p-2.5 rounded-xl">
              <AlertTriangle size={18} color="#F59E0B" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Inventory Alerts</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Coupons Item */}
        <Pressable 
          onPress={() => router.push('/coupons/index')}
          className="flex-row justify-between items-center p-3 rounded-2xl active:bg-slate-150"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-purple-500/10 p-2.5 rounded-xl">
              <Ticket size={18} color="#A855F7" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Coupon Codes</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Reviews Item */}
        <Pressable 
          onPress={() => router.push('/reviews/index')}
          className="flex-row justify-between items-center p-3 rounded-2xl active:bg-slate-150"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-emerald-500/10 p-2.5 rounded-xl">
              <MessageSquare size={18} color="#10B981" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Product Reviews</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

      </View>

      {/* 4. Settings & Preferences Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-4 mb-5 gap-0.5">
        
        {/* Settings Item */}
        <Pressable 
          onPress={() => router.push('/settings/index')}
          className="flex-row justify-between items-center p-3 rounded-2xl active:bg-slate-150"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-slate-100 p-2.5 rounded-xl">
              <Settings size={18} color="#94A3B8" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">App Settings</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

      </View>

      {/* 5. Logout Button */}
      <Pressable 
        onPress={handleLogout}
        className="bg-red-500/10 border border-red-500/20 h-12 rounded-2xl flex-row items-center justify-center gap-2 active:bg-red-500/20 shadow-sm"
      >
        <LogOut size={18} color="#EF4444" />
        <Text className="text-red-400 font-extrabold text-base">Logout Account</Text>
      </Pressable>

    </ScrollView>
  );
}
