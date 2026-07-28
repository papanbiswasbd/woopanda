import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../shared/store/authStore';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { syncService } from '../../shared/services/syncService';
import { 
  BarChart3, AlertTriangle, Ticket, MessageSquare, 
  Settings, LogOut, RefreshCw, Globe, ChevronRight, Key, ShieldAlert, Users, User, Repeat
} from 'lucide-react-native';

export default function MoreHubScreen() {
  const router = useRouter();
  const { credentials, logout, disconnectStore, firebaseUser } = useAuthStore();
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

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

  const handleSwitchStore = () => {
    Alert.alert(
      'Switch WooCommerce Store',
      'This will detach your active WooCommerce store on this device while keeping you logged into your cloud account. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Switch Store', 
          style: 'default',
          onPress: async () => {
            await disconnectStore();
            router.replace('/auth/connect');
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out Cloud Account',
      'Are you sure you want to log out of your Firebase account on this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth/login');
          }
        }
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. Account & WooCommerce Store Meta Information (Max 8px border radius) */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 mb-4 shadow-sm">
        
        {/* Firebase Cloud User Account */}
        {firebaseUser && (
          <View className="flex-row items-center gap-3 pb-3.5 mb-3.5 border-b border-slate-100">
            <View className="w-10 h-10 bg-purple-500/10 rounded-md items-center justify-center border border-purple-500/20">
              <User size={18} color="#A855F7" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 font-extrabold text-xs">Cloud Profile</Text>
              <Text className="text-slate-500 font-semibold text-xs" numberOfLines={1}>
                {firebaseUser.email || 'Google User Account'}
              </Text>
            </View>
            <View className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              <Text className="text-emerald-700 font-black text-[10px]">SYNCED</Text>
            </View>
          </View>
        )}

        {/* Connected WooCommerce Store */}
        <View className="flex-row gap-3.5 items-center">
          <View className="w-10 h-10 bg-blue-600/10 rounded-md items-center justify-center border border-blue-500/20">
            <Globe size={18} color="#3B82F6" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 font-black text-sm" numberOfLines={1}>
              {credentials?.siteUrl?.replace(/^https?:\/\//, '')}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-1">
              <Key size={10} color="#64748B" />
              <Text className="text-slate-500 text-[10px] font-extrabold uppercase tracking-wider">
                Auth: {credentials?.authMethod?.replace('_', ' ')}
              </Text>
            </View>
          </View>
        </View>

      </View>

      {/* 2. Offline Synchronization Queue Status */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 mb-4 shadow-sm">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text className="text-slate-900 font-black text-sm">Offline Sync Engine</Text>
            {pendingQueueCount > 0 ? (
              <Text className="text-amber-600 text-xs mt-0.5 font-bold">
                {pendingQueueCount} modification(s) queued
              </Text>
            ) : (
              <Text className="text-slate-500 text-xs mt-0.5 font-semibold">
                No pending edits. All synchronized.
              </Text>
            )}
          </View>
          
          <Pressable 
            onPress={handleSyncNow}
            disabled={syncing}
            className={`h-9 px-3.5 rounded-md flex-row items-center justify-center gap-1.5 ${
              syncing ? 'bg-blue-800' : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={13} color="#FFFFFF" />
                <Text className="text-white font-extrabold text-xs">Sync Now</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* 3. Operational Features List */}
      <View className="bg-white border border-slate-200 rounded-lg p-2 mb-4 shadow-sm">
        
        {/* Customer Directory Item */}
        <Pressable 
          onPress={() => router.push('/customers')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-purple-500/10 p-2 rounded-md">
              <Users size={18} color="#A855F7" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Customer Directory</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Analytics Item */}
        <Pressable 
          onPress={() => router.push('/analytics')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-blue-500/10 p-2 rounded-md">
              <BarChart3 size={18} color="#3B82F6" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Detailed Analytics</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Inventory Item */}
        <Pressable 
          onPress={() => router.push('/inventory/index')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-amber-500/10 p-2 rounded-md">
              <AlertTriangle size={18} color="#F59E0B" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Inventory Alerts</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Coupons Item */}
        <Pressable 
          onPress={() => router.push('/coupons/index')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-purple-500/10 p-2 rounded-md">
              <Ticket size={18} color="#A855F7" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Coupon Codes</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

        {/* Reviews Item */}
        <Pressable 
          onPress={() => router.push('/reviews/index')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-emerald-500/10 p-2 rounded-md">
              <MessageSquare size={18} color="#10B981" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">Product Reviews</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

      </View>

      {/* 4. Settings & Preferences Card */}
      <View className="bg-white border border-slate-200 rounded-lg p-2 mb-5 shadow-sm">
        
        <Pressable 
          onPress={() => router.push('/settings/index')}
          className="flex-row justify-between items-center p-3 rounded-lg active:bg-slate-100"
        >
          <View className="flex-row items-center gap-3.5">
            <View className="bg-slate-100 p-2 rounded-md">
              <Settings size={18} color="#475569" />
            </View>
            <Text className="text-slate-800 font-bold text-sm">App Settings</Text>
          </View>
          <ChevronRight size={16} color="#475569" />
        </Pressable>

      </View>

      {/* 5. Store & Account Actions */}
      <View className="gap-3">
        {/* Switch WooCommerce Store */}
        <Pressable 
          onPress={handleSwitchStore}
          className="bg-slate-200 border border-slate-300 h-11 rounded-lg flex-row items-center justify-center gap-2 active:bg-slate-300"
        >
          <Repeat size={16} color="#334155" />
          <Text className="text-slate-800 font-extrabold text-sm">Switch WooCommerce Store</Text>
        </Pressable>

        {/* Sign Out Account */}
        <Pressable 
          onPress={handleLogout}
          className="bg-red-500/10 border border-red-500/20 h-11 rounded-lg flex-row items-center justify-center gap-2 active:bg-red-500/20 shadow-sm"
        >
          <LogOut size={16} color="#EF4444" />
          <Text className="text-red-600 font-black text-sm uppercase tracking-wide">Sign Out Account</Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}
