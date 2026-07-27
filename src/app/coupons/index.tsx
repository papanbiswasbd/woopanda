import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform, ScrollView, RefreshControl } from 'react-native';
import { db, sqlite } from '../../shared/database/db';
import { coupons } from '../../shared/database/schema';
import { eq } from 'drizzle-orm';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { syncService } from '../../shared/services/syncService';
import { Ticket, Plus, Trash2, Calendar, ShoppingCart, Percent, AlertCircle } from 'lucide-react-native';

const DISCOUNT_TYPES = [
  { label: 'Fixed Cart ($)', value: 'fixed_cart' },
  { label: 'Percentage (%)', value: 'percent' },
  { label: 'Fixed Product ($)', value: 'fixed_product' },
];

export default function CouponsScreen() {
  const [couponList, setCouponList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Creator Modal states
  const [creatorVisible, setCreatorVisible] = useState(false);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [discountType, setDiscountType] = useState('fixed_cart');
  const [description, setDescription] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  // Load cached coupons from SQLite
  const loadCoupons = useCallback(() => {
    try {
      const rows = sqlite.getAllSync<any>(
        `SELECT id, code, amount, discount_type as discountType, description, usage_count as usageCount, usage_limit as usageLimit, date_expires as dateExpires 
         FROM coupons 
         ORDER BY id DESC`
      );
      const parsed = rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        amount: r.amount,
        discountType: r.discountType,
        description: r.description || '',
        usageCount: r.usageCount || 0,
        usageLimit: r.usageLimit,
        dateExpires: r.dateExpires,
      }));
      setCouponList(parsed);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncCoupons();
    loadCoupons();
    setRefreshing(false);
  };

  // Create Coupon (Optimistic + Offline Queue)
  const handleCreateCoupon = async () => {
    if (!code.trim()) {
      Alert.alert('Validation Error', 'Coupon code is required.');
      return;
    }
    if (!amount.trim()) {
      Alert.alert('Validation Error', 'Discount amount is required.');
      return;
    }

    const tempId = -1 * Math.floor(Date.now());
    const finalCode = code.trim().toUpperCase();

    try {
      // 1. Optimistic database insert
      const newCoupon = {
        id: tempId,
        code: finalCode,
        amount: amount.trim(),
        discountType,
        description: description.trim() || null,
        usageCount: 0,
        usageLimit: usageLimit.trim() !== '' ? Number(usageLimit) : null,
        dateExpires: null,
        lastUpdated: Date.now(),
      };

      await db.insert(coupons).values(newCoupon);

      // 2. Queue mutation upload task
      await syncQueueService.enqueue('CREATE_COUPON', {
        code: finalCode,
        amount: amount.trim(),
        discount_type: discountType,
        description: description.trim(),
        individual_use: true,
        usage_limit: usageLimit.trim() !== '' ? Number(usageLimit) : null,
      });

      // Update UI state
      setCouponList(prev => [newCoupon, ...prev]);
      setCreatorVisible(false);

      // Reset Form fields
      setCode('');
      setAmount('');
      setDiscountType('fixed_cart');
      setDescription('');
      setUsageLimit('');

      // Process Queue
      syncQueueService.processQueue().catch(() => {});

      Alert.alert('Success', 'Coupon code enqueued for background sync.');
    } catch (error) {
      console.error('Failed to create coupon locally:', error);
      Alert.alert('Error', 'Failed to save coupon locally.');
    }
  };

  // Delete Coupon (Optimistic + Offline Queue)
  const handleDeleteCoupon = (coupon: any) => {
    Alert.alert(
      'Delete Coupon',
      `Are you sure you want to delete "${coupon.code}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete locally
              await db.delete(coupons).where(eq(coupons.id, coupon.id));
              
              // Queue API deletion
              await syncQueueService.enqueue('DELETE_COUPON', { id: coupon.id });
              
              // Update state
              setCouponList(prev => prev.filter(c => c.id !== coupon.id));
              
              // Process sync queue
              syncQueueService.processQueue().catch(() => {});
            } catch (err) {
              console.error('Failed to delete coupon:', err);
            }
          }
        }
      ]
    );
  };

  const getDiscountSuffix = (type: string, val: string) => {
    const num = Number(val || 0);
    if (type === 'percent') {
      return `${num}% Off`;
    }
    return `$${num.toFixed(2)} Off`;
  };

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-4">
      
      {/* Add coupon bar */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Coupons List</Text>
        
        <Pressable
          onPress={() => setCreatorVisible(true)}
          className="bg-blue-600 px-4 py-2 rounded-xl flex-row items-center gap-1.5 active:bg-blue-700 shadow-md shadow-blue-500/20"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-slate-900 font-bold text-xs">Create Coupon</Text>
        </Pressable>
      </View>

      {/* Coupons List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : couponList.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <Ticket size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">No coupons available</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-6">
            Swipe down to pull discount codes from WooCommerce or tap Create to add one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={couponList}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3.5 flex-row justify-between items-center">
              
              <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-2">
                  <View className="bg-dashed border border-blue-500/30 px-3 py-1 rounded bg-blue-500/5">
                    <Text className="text-blue-400 font-extrabold text-sm tracking-wider">{item.code}</Text>
                  </View>
                  <Text className="text-emerald-400 font-extrabold text-xs">
                    {getDiscountSuffix(item.discountType, item.amount)}
                  </Text>
                </View>

                {item.description ? (
                  <Text className="text-slate-600 text-xs mt-2" numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}

                <View className="flex-row items-center gap-3.5 mt-2 font-semibold">
                  <Text className="text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                    Used: {item.usageCount} times {item.usageLimit ? `/ Limit: ${item.usageLimit}` : ''}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => handleDeleteCoupon(item)}
                className="h-10 w-10 bg-red-500/10 border border-red-500/20 rounded-xl items-center justify-center active:bg-red-500/20"
              >
                <Trash2 size={16} color="#EF4444" />
              </Pressable>

            </View>
          )}
        />
      )}

      {/* Creator Modal */}
      <Modal
        visible={creatorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreatorVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end bg-slate-900/40"
        >
          <ScrollView className="bg-white border-t border-slate-200 rounded-t-3xl p-6 max-h-[90%]">
            <Text className="text-slate-900 font-extrabold text-base mb-5 text-center">New Coupon Code</Text>
            
            <View className="gap-4">
              
              {/* Code */}
              <View>
                <Text className="text-slate-600 font-semibold text-xs mb-2">Coupon Code Name *</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="e.g. SUMMER50"
                  placeholderTextColor="#475569"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
                />
              </View>

              {/* Discount Value */}
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-slate-600 font-semibold text-xs mb-2">Discount Amount *</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                    keyboardType="decimal-pad"
                    className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
                  />
                </View>

                {/* Limit usage */}
                <View className="flex-1">
                  <Text className="text-slate-600 font-semibold text-xs mb-2">Usage Limit</Text>
                  <TextInput
                    value={usageLimit}
                    onChangeText={setUsageLimit}
                    placeholder="No limit"
                    placeholderTextColor="#475569"
                    keyboardType="number-pad"
                    className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
                  />
                </View>
              </View>

              {/* Discount Type Selector */}
              <View>
                <Text className="text-slate-600 font-semibold text-xs mb-2">Discount Type</Text>
                <View className="flex-row gap-3">
                  {DISCOUNT_TYPES.map((type) => (
                    <Pressable
                      key={type.value}
                      onPress={() => setDiscountType(type.value)}
                      className={`flex-1 h-10 rounded-xl justify-center items-center border ${
                        discountType === type.value 
                          ? 'bg-blue-500/10 border-blue-500' 
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className={`text-[10px] font-bold uppercase ${
                        discountType === type.value ? 'text-blue-400' : 'text-slate-500'
                      }`} numberOfLines={1}>
                        {type.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Description */}
              <View>
                <Text className="text-slate-600 font-semibold text-xs mb-2">Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe coupon details..."
                  placeholderTextColor="#475569"
                  className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
                />
              </View>

            </View>

            {/* Actions */}
            <View className="flex-row gap-4 mt-6 mb-12">
              <Pressable
                onPress={() => setCreatorVisible(false)}
                className="flex-1 bg-slate-100 h-12 rounded-2xl items-center justify-center active:bg-slate-750"
              >
                <Text className="text-slate-700 font-bold text-sm">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleCreateCoupon}
                className="flex-1 bg-blue-600 h-12 rounded-2xl items-center justify-center active:bg-blue-700"
              >
                <Text className="text-slate-900 font-bold text-sm">Create Coupon</Text>
              </Pressable>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}
