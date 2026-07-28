import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { useAuthStore } from '../../shared/store/authStore';
import { useRouter } from 'expo-router';
import { Settings, Moon, Sun, DollarSign, AlertCircle, Info, Check, Cloud } from 'lucide-react-native';

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { 
    darkMode, currency, lowStockThreshold, 
    setDarkMode, setCurrency, setLowStockThreshold 
  } = useSettingsStore();
  const { firebaseUser } = useAuthStore();

  const [thresholdInput, setThresholdInput] = useState(String(lowStockThreshold));
  const [updating, setUpdating] = useState(false);

  const handleSaveThreshold = () => {
    const num = Number(thresholdInput);
    if (isNaN(num) || num < 0) {
      Alert.alert('Validation Error', 'Please enter a valid stock quantity number.');
      return;
    }
    
    setUpdating(true);
    setLowStockThreshold(num);
    setTimeout(() => {
      setUpdating(false);
      Alert.alert('Settings Saved', 'Low stock alert threshold updated.');
    }, 500);
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. Theme Configuration Card (Max 8px border radius) */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 mb-4 shadow-sm">
        <View className="flex-row items-center gap-2.5 mb-3.5">
          <Moon size={18} color="#3B82F6" />
          <Text className="text-slate-900 font-bold text-sm">Theme Mode</Text>
        </View>

        <View className="flex-row gap-2.5">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setDarkMode(mode)}
              className={`flex-1 h-10 rounded-md border justify-center items-center flex-row gap-1.5 ${
                darkMode === mode 
                  ? 'bg-blue-500/10 border-blue-500' 
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {mode === 'light' && <Sun size={12} color={darkMode === 'light' ? '#3B82F6' : '#64748B'} />}
              {mode === 'dark' && <Moon size={12} color={darkMode === 'dark' ? '#3B82F6' : '#64748B'} />}
              <Text className={`text-xs font-black uppercase ${
                darkMode === mode ? 'text-blue-600' : 'text-slate-500'
              }`}>
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 2. Currency Preferences Card */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 mb-4 shadow-sm">
        <View className="flex-row items-center gap-2.5 mb-3.5">
          <DollarSign size={18} color="#10B981" />
          <Text className="text-slate-900 font-bold text-sm">Store Currency</Text>
        </View>
        
        <View className="flex-row flex-wrap gap-2">
          {CURRENCIES.map((curr) => (
            <Pressable
              key={curr.code}
              onPress={() => setCurrency(curr.code)}
              className={`h-9 px-3.5 rounded-md border justify-center items-center flex-row gap-1.5 ${
                currency === curr.code 
                  ? 'bg-emerald-500/10 border-emerald-500' 
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Text className={`text-xs font-extrabold ${
                currency === curr.code ? 'text-emerald-700' : 'text-slate-500'
              }`}>
                {curr.code} ({curr.symbol})
              </Text>
              {currency === curr.code && <Check size={12} color="#10B981" />}
            </Pressable>
          ))}
        </View>
      </View>

      {/* 3. Stock Threshold Card */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 mb-4 shadow-sm">
        <View className="flex-row items-center gap-2 mb-1">
          <AlertCircle size={18} color="#F59E0B" />
          <Text className="text-slate-900 font-bold text-sm">Stock Alerts Threshold</Text>
        </View>
        <Text className="text-slate-500 text-[11px] mb-3 font-semibold">
          Alerts will trigger for items with stock levels below this quantity.
        </Text>

        <View className="flex-row gap-2.5 items-center">
          <TextInput
            value={thresholdInput}
            onChangeText={setThresholdInput}
            keyboardType="number-pad"
            className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 font-bold rounded-lg h-10 px-3 text-sm"
          />
          
          <Pressable
            onPress={handleSaveThreshold}
            disabled={updating}
            className="bg-blue-600 h-10 px-5 rounded-lg justify-center items-center active:bg-blue-700 shadow-sm"
          >
            {updating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-extrabold text-xs uppercase tracking-wider">Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* 4. About App & Cloud Architecture Information Card */}
      <View className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <View className="flex-row items-center gap-2.5 mb-3.5">
          <Info size={18} color="#64748B" />
          <Text className="text-slate-900 font-bold text-sm">System & Cloud Architecture</Text>
        </View>

        <View className="gap-2.5">
          <View className="flex-row justify-between items-center bg-slate-50 p-2.5 rounded-md border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Cloud Account</Text>
            <View className="flex-row items-center gap-1.5">
              <Cloud size={14} color="#3B82F6" />
              <Text className="text-slate-800 text-xs font-extrabold">{firebaseUser?.email || 'Firebase Auth'}</Text>
            </View>
          </View>
          <View className="flex-row justify-between items-center bg-slate-50 p-2.5 rounded-md border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Version</Text>
            <Text className="text-slate-800 text-xs font-extrabold">1.0.0 (Enterprise Cloud SaaS)</Text>
          </View>
          <View className="flex-row justify-between items-center bg-slate-50 p-2.5 rounded-md border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Platform Storage Engine</Text>
            <Text className="text-slate-800 text-xs font-extrabold">SQLite + Firestore Cloud Sync</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}
