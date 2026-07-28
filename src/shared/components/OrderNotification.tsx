import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, SafeAreaView, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Bell, ShoppingBag, ChevronRight, X } from 'lucide-react-native';
import { useSettingsStore, getCurrencySymbol } from '../store/settingsStore';

export default function OrderNotification() {
  const router = useRouter();
  const { newOrderNotification, clearNewOrderNotification } = useSettingsStore();
  const translateY = useRef(new Animated.Value(-150)).current;
  
  useEffect(() => {
    if (newOrderNotification) {
      // Slide down
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
      
      // Auto dismiss after 5 seconds
      const timer = setTimeout(() => {
        dismiss();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [newOrderNotification]);

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 300,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      clearNewOrderNotification();
    });
  };

  const handlePress = () => {
    if (newOrderNotification) {
      router.push(`/orders/${newOrderNotification.id}`);
      dismiss();
    }
  };

  if (!newOrderNotification) return null;

  const symbol = getCurrencySymbol(newOrderNotification.currency);

  return (
    <SafeAreaView className="absolute top-0 w-full z-50 pointer-events-box-none pt-2 px-4" style={{ zIndex: 1000, elevation: 1000 }} pointerEvents="box-none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable 
          onPress={handlePress}
          className="bg-white/95 dark:bg-slate-900/95 overflow-hidden rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex-row shadow-xl shadow-slate-900/10"
          style={{ 
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.1,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Accent Line */}
          <View className="w-1.5 bg-blue-500 h-full absolute left-0" />
          
          <View className="flex-row items-center w-full p-3.5 pl-5">
            
            {/* Image / Icon */}
            <View className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
              {newOrderNotification.image ? (
                <Image 
                  source={newOrderNotification.image}
                  className="w-full h-full"
                  contentFit="cover"
                />
              ) : (
                <ShoppingBag size={20} color="#3B82F6" />
              )}
            </View>

            {/* Details */}
            <View className="flex-1 ml-3 justify-center">
              <View className="flex-row items-center space-x-1 mb-1">
                <Bell size={12} color="#3B82F6" className="mr-1" />
                <Text className="text-blue-500 font-bold text-xs uppercase tracking-widest">
                  New Order
                </Text>
              </View>
              
              <Text className="text-slate-900 dark:text-white font-bold text-base mb-0.5" numberOfLines={1}>
                #{newOrderNotification.number} • {newOrderNotification.customerName}
              </Text>
              
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-medium" numberOfLines={1}>
                {newOrderNotification.quantity} {newOrderNotification.quantity === 1 ? 'item' : 'items'} • {symbol}{newOrderNotification.total}
              </Text>
            </View>

            {/* Chevron */}
            <View className="ml-2 w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center">
              <ChevronRight size={18} color="#94A3B8" />
            </View>
            
            {/* Dismiss Button */}
            <Pressable 
              onPress={dismiss}
              className="absolute top-2 right-2 p-1 opacity-50"
              hitSlop={15}
            >
              <X size={14} color="#64748B" />
            </Pressable>
            
          </View>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}
