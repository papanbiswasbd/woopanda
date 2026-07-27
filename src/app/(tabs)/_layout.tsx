import React, { useState, useEffect, useRef } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, View, Text, Animated, Easing, Modal } from 'react-native';
import { LayoutDashboard, ShoppingBag, Receipt, Users, Menu, RefreshCw } from 'lucide-react-native';
import { useAuthStore } from '../../shared/store/authStore';
import { syncService } from '../../shared/services/syncService';
import { sqlite } from '../../shared/database/db';

export default function TabLayout() {
  const { credentials } = useAuthStore();
  const router = useRouter();
  const [openOrdersCount, setOpenOrdersCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const spinValue = useRef(new Animated.Value(0)).current;

  const hostName = credentials?.siteUrl 
    ? credentials.siteUrl.replace(/^https?:\/\//, '') 
    : 'WooCommerce';

  // Rotation Animation Loop when syncing is active
  useEffect(() => {
    if (syncing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
      Animated.timing(spinValue, { toValue: 0, duration: 0, useNativeDriver: true }).stop();
    }
  }, [syncing]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isUpdatingCounts = useRef(false);

  // Query SQLite to refresh counts in real-time
  const updateCounts = async () => {
    if (isUpdatingCounts.current) return;
    isUpdatingCounts.current = true;
    try {
      // 1. Fetch pending & processing orders
      const ordersRes = await sqlite.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM orders WHERE status = 'pending' OR status = 'processing'"
      );
      setOpenOrdersCount(ordersRes[0]?.count || 0);

      // 2. Fetch pending items in background sync queue
      const queueRes = await sqlite.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
      );
      setPendingSyncCount(queueRes[0]?.count || 0);
    } catch (e) {
      console.log('Error polling SQLite counts:', e);
    } finally {
      isUpdatingCounts.current = false;
    }
  };

  useEffect(() => {
    updateCounts();
    // Poll every 3 seconds for real-time high-productivity badge updates
    const timer = setInterval(updateCounts, 3000);
    return () => clearInterval(timer);
  }, []);

  const triggerManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    console.log('Triggering manual synchronization...');
    try {
      await syncService.syncAll();
      updateCounts();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3B82F6', // Blue-500
        tabBarInactiveTintColor: '#94A3B8', // Slate-400
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0', // Slate-200
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8F0',
          elevation: 0,
          shadowOpacity: 0,
        },
        // Page Title as primary heading, Website name small as subtitle
        headerTitle: ({ children }) => (
          <View>
            <Text className="text-slate-900 font-extrabold text-[15px] leading-tight">{children}</Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <Text className="text-slate-500 text-[10px] font-bold">{hostName}</Text>
            </View>
          </View>
        ),
        // Premium Custom Header right profile showing sync statuses
        headerRight: () => (
          <View className="flex-row items-center gap-3 mr-4">
            {pendingSyncCount > 0 && (
              <View className="bg-amber-100 border border-amber-200 px-2.5 py-1 rounded flex-row items-center gap-1">
                <Text className="text-amber-700 text-[10px] font-bold">↑ {pendingSyncCount} pending</Text>
              </View>
            )}
            <Pressable 
              onPress={triggerManualSync}
              disabled={syncing}
              className="p-2 active:bg-slate-100 rounded"
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCw size={18} color="#3B82F6" />
              </Animated.View>
            </Pressable>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarLabel: 'Products',
          tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarLabel: 'Orders',
          tabBarBadge: openOrdersCount > 0 ? openOrdersCount : undefined,
          tabBarBadgeStyle: { 
            backgroundColor: '#EF4444', 
            color: '#FFFFFF', 
            fontSize: 10, 
            fontWeight: 'bold',
            marginTop: -2
          },
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarLabel: 'Customers',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More Hub',
          tabBarLabel: 'More',
          tabBarIcon: ({ color, size }) => <Menu size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
