import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useSettingsStore } from '../../shared/store/settingsStore';
import { useRouter } from 'expo-router';
import { Settings, Moon, Sun, DollarSign, AlertCircle, Info, ChevronRight, Check } from 'lucide-react-native';

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
      
      {/* 1. Theme Configuration Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row items-center gap-2.5 mb-4">
          <Moon size={18} color="#3B82F6" />
          <Text className="text-slate-900 font-bold text-sm">Theme Mode</Text>
        </View>

        <View className="flex-row gap-3">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setDarkMode(mode)}
              className={`flex-1 h-11 rounded-xl border justify-center items-center flex-row gap-1.5 ${
                darkMode === mode 
                  ? 'bg-blue-500/10 border-blue-500' 
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {mode === 'light' && <Sun size={12} color={darkMode === 'light' ? '#3B82F6' : '#64748B'} />}
              {mode === 'dark' && <Moon size={12} color={darkMode === 'dark' ? '#3B82F6' : '#64748B'} />}
              <Text className={`text-xs font-bold uppercase ${
                darkMode === mode ? 'text-blue-400' : 'text-slate-500'
              }`}>
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 2. Currency Preferences Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row items-center gap-2.5 mb-4">
          <DollarSign size={18} color="#10B981" />
          <Text className="text-slate-900 font-bold text-sm">Store Currency</Text>
        </View>
        
        <View className="flex-row flex-wrap gap-2.5">
          {CURRENCIES.map((curr) => (
            <Pressable
              key={curr.code}
              onPress={() => setCurrency(curr.code)}
              className={`h-10 px-4 rounded-xl border justify-center items-center flex-row gap-1.5 ${
                currency === curr.code 
                  ? 'bg-emerald-500/10 border-emerald-500' 
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Text className={`text-xs font-extrabold ${
                currency === curr.code ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {curr.code} ({curr.symbol})
              </Text>
              {currency === curr.code && <Check size={10} color="#10B981" />}
            </Pressable>
          ))}
        </View>
      </View>

      {/* 3. Stock Threshold Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row items-center gap-2.5 mb-2">
          <AlertCircle size={18} color="#F59E0B" />
          <Text className="text-slate-900 font-bold text-sm">Stock Alerts Threshold</Text>
        </View>
        <Text className="text-slate-500 text-[10px] mb-4 font-semibold">
          Alerts will trigger for items with stock levels below this number
        </Text>

        <View className="flex-row gap-3 items-center">
          <TextInput
            value={thresholdInput}
            onChangeText={setThresholdInput}
            keyboardType="number-pad"
            className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
          />
          
          <Pressable
            onPress={handleSaveThreshold}
            disabled={updating}
            className="bg-blue-600 h-11 px-5 rounded-xl justify-center items-center active:bg-blue-700 shadow-md shadow-blue-500/20"
          >
            {updating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-slate-900 font-bold text-sm">Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* 4. About App Information Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5">
        <View className="flex-row items-center gap-2.5 mb-4">
          <Info size={18} color="#94A3B8" />
          <Text className="text-slate-900 font-bold text-sm">Application Information</Text>
        </View>

        <View className="gap-3.5">
          <View className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Version</Text>
            <Text className="text-slate-800 text-xs font-extrabold">1.0.0 (Enterprise SaaS)</Text>
          </View>
          <View className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Platform Architecture</Text>
            <Text className="text-slate-800 text-xs font-extrabold">SQLite + Drizzle ORM</Text>
          </View>
          <View className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <Text className="text-slate-600 text-xs font-semibold">Database Engine</Text>
            <Text className="text-slate-800 text-xs font-extrabold">WAL Journal Mode Mode</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}
