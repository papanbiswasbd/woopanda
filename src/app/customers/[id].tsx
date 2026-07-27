import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Clipboard, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import * as Linking from 'expo-linking';
import { 
  ArrowLeft, Phone, Mail, MessageSquare, MapPin, Copy, 
  DollarSign, ShoppingBag, TrendingUp, ChevronRight 
} from 'lucide-react-native';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const customerId = Number(id);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);

  // Load customer profile and orders history from SQLite
  useEffect(() => {
    try {
      // 1. Fetch customer details
      const custRes = sqlite.getAllSync<any>(
        `SELECT id, email, first_name as firstName, last_name as lastName, username, billing, shipping, orders_count as ordersCount, total_spent as totalSpent 
         FROM customers 
         WHERE id = ? LIMIT 1`,
        customerId
      );

      if (custRes && custRes.length > 0) {
        const row = custRes[0];
        let billingObj = {};
        let shippingObj = {};
        
        try { billingObj = row.billing ? JSON.parse(row.billing) : {}; } catch {}
        try { shippingObj = row.shipping ? JSON.parse(row.shipping) : {}; } catch {}

        setProfile({
          id: row.id,
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          username: row.username,
          billing: billingObj,
          shipping: shippingObj,
          ordersCount: row.ordersCount || 0,
          totalSpent: row.totalSpent || '0.00',
        });

        // 2. Fetch order history matching this customer ID (or matching billing email if guest)
        const emailParam = row.email || '';
        const orderRes = sqlite.getAllSync<any>(
          `SELECT id, number, total, status, date_created as dateCreated, currency 
           FROM orders 
           WHERE customer_id = ? OR billing LIKE ? 
           ORDER BY date_created DESC`,
          row.id, `%${emailParam}%`
        );

        const parsedOrders = orderRes.map((o: any) => ({
          id: o.id,
          number: o.number,
          total: o.total,
          status: o.status,
          dateCreated: o.dateCreated,
          currency: o.currency || 'USD',
        }));

        setCustomerOrders(parsedOrders);
      } else {
        Alert.alert('Error', 'Customer profile not found.');
        router.back();
      }
    } catch (err) {
      console.error('Failed to load customer profile details:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  const { billing, shipping } = profile;
  const averageOrderValue = profile.ordersCount > 0 
    ? Number(profile.totalSpent) / profile.ordersCount 
    : 0;

  // Contact Customer Helpers
  const handleCall = () => {
    if (billing?.phone) {
      Linking.openURL(`tel:${billing.phone}`);
    } else {
      Alert.alert('Missing Info', 'No phone available.');
    }
  };

  const handleWhatsApp = () => {
    if (billing?.phone) {
      const clean = billing.phone.replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${clean}`);
    } else {
      Alert.alert('Missing Info', 'No phone available.');
    }
  };

  const handleEmail = () => {
    if (profile.email) {
      Linking.openURL(`mailto:${profile.email}`);
    } else {
      Alert.alert('Missing Info', 'No email available.');
    }
  };

  const handleCopyAddress = (type: 'billing' | 'shipping') => {
    const addr = type === 'billing' ? billing : shipping;
    const text = `${addr.first_name} ${addr.last_name}\n${addr.address_1} ${addr.address_2 || ''}\n${addr.city}, ${addr.state} ${addr.postcode}\n${addr.country}`;
    Clipboard.setString(text);
    Alert.alert('Copied', 'Address copied to clipboard!');
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. Profile Core Info Header */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 items-center">
        <View className="w-16 h-16 bg-blue-600/10 rounded-full items-center justify-center border border-blue-500/20 mb-3">
          <Text className="text-blue-400 font-extrabold text-xl">
            {(profile.firstName?.charAt(0) || 'C').toUpperCase()}
          </Text>
        </View>
        <Text className="text-slate-900 font-extrabold text-lg text-center">
          {profile.firstName} {profile.lastName || 'Guest User'}
        </Text>
        <Text className="text-slate-500 text-xs mt-1 text-center">{profile.email || 'No email profile'}</Text>
        
        {/* Contact actions */}
        <View className="flex-row gap-3 mt-4 border-t border-slate-200/60 pt-4 w-full justify-center">
          <Pressable 
            onPress={handleCall}
            className="flex-1 bg-slate-150 h-10 rounded-xl items-center justify-center border border-slate-200 active:bg-slate-150"
          >
            <Phone size={16} color="#3B82F6" />
          </Pressable>

          <Pressable 
            onPress={handleWhatsApp}
            className="flex-1 bg-slate-150 h-10 rounded-xl items-center justify-center border border-slate-200 active:bg-slate-150"
          >
            <MessageSquare size={16} color="#10B981" />
          </Pressable>

          <Pressable 
            onPress={handleEmail}
            className="flex-1 bg-slate-150 h-10 rounded-xl items-center justify-center border border-slate-200 active:bg-slate-150"
          >
            <Mail size={16} color="#F59E0B" />
          </Pressable>
        </View>
      </View>

      {/* 2. Key Metrics Row */}
      <View className="flex-row gap-4 mb-5">
        
        <View className="flex-1 bg-white border border-slate-200 p-3.5 rounded-2xl items-center gap-1.5">
          <DollarSign size={18} color="#10B981" />
          <Text className="text-slate-500 text-[9px] uppercase font-bold">Total LTV</Text>
          <Text className="text-slate-900 font-extrabold text-sm">${Number(profile.totalSpent).toFixed(2)}</Text>
        </View>

        <View className="flex-1 bg-white border border-slate-200 p-3.5 rounded-2xl items-center gap-1.5">
          <ShoppingBag size={18} color="#3B82F6" />
          <Text className="text-slate-500 text-[9px] uppercase font-bold">Total Orders</Text>
          <Text className="text-slate-900 font-extrabold text-sm">{profile.ordersCount}</Text>
        </View>

        <View className="flex-1 bg-white border border-slate-200 p-3.5 rounded-2xl items-center gap-1.5">
          <TrendingUp size={18} color="#F59E0B" />
          <Text className="text-slate-500 text-[9px] uppercase font-bold">Avg Order</Text>
          <Text className="text-slate-900 font-extrabold text-sm">${averageOrderValue.toFixed(2)}</Text>
        </View>

      </View>

      {/* 3. Address Panels */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        
        {/* Shipping */}
        <View>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Shipping Address</Text>
            <Pressable onPress={() => handleCopyAddress('shipping')} className="p-1 active:opacity-50">
              <Copy size={13} color="#64748B" />
            </Pressable>
          </View>
          <Text className="text-slate-700 text-xs leading-normal">
            {shipping?.first_name} {shipping?.last_name}<br/>
            {shipping?.address_1} {shipping?.address_2 || ''}<br/>
            {shipping?.city}, {shipping?.state} {shipping?.postcode}<br/>
            {shipping?.country}
          </Text>
        </View>

        {/* Billing */}
        <View className="border-t border-slate-200 pt-3.5">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Billing Address</Text>
            <Pressable onPress={() => handleCopyAddress('billing')} className="p-1 active:opacity-50">
              <Copy size={13} color="#64748B" />
            </Pressable>
          </View>
          <Text className="text-slate-700 text-xs leading-normal">
            {billing?.first_name} {billing?.last_name}<br/>
            {billing?.address_1} {billing?.address_2 || ''}<br/>
            {billing?.city}, {billing?.state} {billing?.postcode}<br/>
            {billing?.country}
          </Text>
        </View>

      </View>

      {/* 4. Purchase History timeline */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5">
        <Text className="text-slate-900 font-bold text-sm mb-4">Purchase History</Text>
        
        {customerOrders.length === 0 ? (
          <View className="items-center py-6">
            <Text className="text-slate-500 text-xs">No order records found for this client.</Text>
          </View>
        ) : (
          <View className="divide-y divide-slate-200">
            {customerOrders.map((ord) => (
              <Pressable 
                key={ord.id}
                onPress={() => router.push(`/orders/${ord.id}`)}
                className="py-3 flex-row justify-between items-center active:opacity-75"
              >
                <View>
                  <Text className="text-slate-900 font-bold text-xs">Order #{ord.number}</Text>
                  <Text className="text-slate-500 text-[10px] mt-1 font-medium">
                    {(() => {
                      if (!ord.dateCreated) return 'Unknown date';
                      try {
                        const normalized = ord.dateCreated.replace(' ', 'T');
                        const parsedDate = new Date(normalized);
                        return isNaN(parsedDate.getTime()) ? ord.dateCreated : parsedDate.toLocaleDateString();
                      } catch {
                        return ord.dateCreated;
                      }
                    })()}
                  </Text>
                </View>
                
                <View className="flex-row items-center gap-2">
                  <View className="items-end">
                    <Text className="text-slate-900 font-bold text-xs">${Number(ord.total).toFixed(2)}</Text>
                    <View className="px-1.5 py-0.5 rounded bg-slate-150 mt-1">
                      <Text className="text-slate-600 text-[9px] uppercase font-bold">{ord.status}</Text>
                    </View>
                  </View>
                  <ChevronRight size={14} color="#64748B" />
                </View>
              </Pressable>
            ))}
          </View>
        )}

      </View>

    </ScrollView>
  );
}
