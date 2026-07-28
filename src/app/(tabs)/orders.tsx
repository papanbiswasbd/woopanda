import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect, useRouter, useGlobalSearchParams } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { Search, Receipt, ChevronRight, Filter, Clock, CheckCircle2, AlertCircle, Phone, Mail, MessageSquare, Check, X } from 'lucide-react-native';
import { getCurrencySymbol, useSettingsStore } from '../../shared/store/settingsStore';

export default function OrdersScreen() {
  const router = useRouter();
  const params = useGlobalSearchParams();
  const { orderStatuses, lastDatabaseUpdate } = useSettingsStore();
  
  const STATUS_OPTIONS = [{ label: 'All', value: 'all' }, ...orderStatuses];
  
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const lastLoadedPageRef = useRef(0);
  const isInitialMount = useRef(true);

  // Keep a ref to the latest loadLocalOrders to avoid stale closures in useFocusEffect
  // without triggering useFocusEffect on every state change.
  useEffect(() => {
    if (params.filter) {
      setSelectedStatus(String(params.filter));
    }
  }, [params.filter]);

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadStatusCounts = async () => {
    try {
      const rows = await sqlite.getAllAsync<any>(
        `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
      );
      const counts: Record<string, number> = {};
      let total = 0;
      rows.forEach(r => {
        const s = String(r.status).toLowerCase();
        counts[s] = r.count;
        total += r.count;
      });
      counts['all'] = total;
      setStatusCounts(counts);
    } catch (e) {
      console.error('Failed to load status counts:', e);
    }
  };

  // Retrieve cached orders from SQLite
  const loadLocalOrders = useCallback(async (pageToLoad: number, isRefresh: boolean = false) => {
    // Prevent duplicate queries for already loaded or currently loading pages
    if (pageToLoad > 1 && pageToLoad <= lastLoadedPageRef.current) {
      return;
    }

    try {
      if (pageToLoad === 1) {
        lastLoadedPageRef.current = 1;
        if (!isRefresh) setLoading(true);
      } else {
        lastLoadedPageRef.current = pageToLoad;
        setLoadingMore(true);
      }

      const limit = 20;
      const offset = (pageToLoad - 1) * limit;

      let rows: any[] = [];
      const queryParams: any[] = [];
      let queryStr = `SELECT id, number, status, total, date_created as dateCreated, billing, currency FROM orders`;

      // Filter logic
      const whereClauses: string[] = [];

      if (selectedStatus !== 'all') {
        whereClauses.push(`LOWER(status) = LOWER(?)`);
        queryParams.push(selectedStatus);
      }

      const query = debouncedSearchQuery.trim();
      if (query.length > 0) {
        whereClauses.push(`(number LIKE ? OR billing LIKE ?)`);
        const term = `%${query}%`;
        queryParams.push(term, term);
      }

      if (whereClauses.length > 0) {
        queryStr += ` WHERE ` + whereClauses.join(' AND ');
      }

      queryStr += ` ORDER BY date_created DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      rows = await sqlite.getAllAsync<any>(queryStr, ...queryParams);

      const parsed = rows.map((r: any) => {
        let billingObj = {};
        try {
          billingObj = r.billing ? JSON.parse(r.billing) : {};
        } catch {}
        return {
          id: r.id,
          number: r.number,
          status: r.status,
          total: r.total,
          dateCreated: r.dateCreated,
          billing: billingObj,
          currency: r.currency || 'USD',
        };
      });

      console.log(`[Orders] loadLocalOrders(page=${pageToLoad}) status=${selectedStatus} query=${queryStr} rows=${parsed.length}`);

      if (pageToLoad === 1) {
        setOrdersList(parsed);
      } else {
        setOrdersList(prev => [...prev, ...parsed]);
      }

      if (parsed.length < limit) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      setPage(pageToLoad);
      
      if (pageToLoad === 1) {
        loadStatusCounts();
      }
    } catch (error) {
      console.error('Failed to load local cached orders:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchQuery, selectedStatus]);

  const loadLocalOrdersRef = useRef(loadLocalOrders);
  useEffect(() => {
    loadLocalOrdersRef.current = loadLocalOrders;
  }, [loadLocalOrders]);

  // Load page 1 on filter/search changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadLocalOrdersRef.current(1);
  }, [debouncedSearchQuery, selectedStatus]);

  // Sync caches and reload UI ONLY on focus
  useFocusEffect(
    useCallback(() => {
      loadLocalOrdersRef.current(1);
    }, [])
  );

  // Silently reload if a background sync updated the database
  useEffect(() => {
    if (isInitialMount.current) return;
    loadLocalOrdersRef.current(1, true); // true = silent refresh without spinner
  }, [lastDatabaseUpdate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncOrders(); // Only fetch delta updates
    await syncService.syncOrderStatuses(); // Extract any new custom statuses
    loadLocalOrders(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    loadLocalOrders(page + 1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-blue-500 bg-blue-50 border border-blue-100';
      case 'completed': return 'text-emerald-600 bg-emerald-50 border border-emerald-100';
      case 'pending': return 'text-amber-600 bg-amber-50 border border-amber-100';
      case 'on-hold': return 'text-purple-600 bg-purple-50 border border-purple-100';
      case 'cancelled': return 'text-red-500 bg-red-50 border border-red-100';
      case 'failed': return 'text-red-700 bg-red-50 border border-red-200';
      case 'refunded': return 'text-gray-600 bg-gray-100 border border-gray-200';
      default: return 'text-indigo-600 bg-indigo-50 border border-indigo-100'; // Default styling for unknown custom statuses
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Unknown date';
    try {
      const normalized = dateStr.replace(' ', 'T');
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return dateStr;
      
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateStr;
    }
  };

  const handleQuickComplete = async (orderId: number) => {
    try {
      // Optimistic update in SQLite
      sqlite.runSync(`UPDATE orders SET status = ?, last_updated = ? WHERE id = ?`, 'completed', Date.now(), orderId);
      
      // Update UI state directly
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, status: 'completed' } : o));
      
      // Enqueue to background sync
      await syncQueueService.enqueue('UPDATE_ORDER', { id: orderId, status: 'completed' });
      syncQueueService.processQueue().catch(() => {});
    } catch (e) {
      Alert.alert('Error', 'Failed to update order status');
    }
  };

  const handleQuickCancel = async (orderId: number) => {
    try {
      sqlite.runSync(`UPDATE orders SET status = ?, last_updated = ? WHERE id = ?`, 'cancelled', Date.now(), orderId);
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
      await syncQueueService.enqueue('UPDATE_ORDER', { id: orderId, status: 'cancelled' });
      syncQueueService.processQueue().catch(() => {});
    } catch (e) {
      Alert.alert('Error', 'Failed to cancel order');
    }
  };

  const openURL = (url: string) => {
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert('Error', 'Action not supported on this device');
    });
  };

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-4">
      
      {/* Search Header */}
      <View className="flex-row items-center gap-3 mb-4">
        <View className="flex-1 bg-white border border-slate-200 rounded-xl px-3 h-11 flex-row items-center">
          <Search size={18} color="#64748B" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search orders by number or name..."
            placeholderTextColor="#64748B"
            autoCorrect={false}
            className="flex-1 text-slate-900 ml-2.5 text-sm h-full"
          />
        </View>
      </View>

      {/* Status Filter Tab Pills */}
      <View className="mb-4 mx-[-20px]">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {STATUS_OPTIONS.map((item) => {
            const count = statusCounts[item.value] || 0;
            const isSelected = selectedStatus === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setSelectedStatus(item.value)}
                className={`px-4 py-2 rounded-full mr-2.5 border flex-row items-center gap-1.5 active:opacity-70 ${
                  isSelected 
                    ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-500/30' 
                    : 'bg-white border-slate-200 shadow-sm shadow-slate-100'
                }`}
              >
                <Text className={`text-xs font-bold ${
                  isSelected ? 'text-white' : 'text-slate-600'
                }`}>
                  {item.label}
                </Text>
                <View className={`px-1.5 py-0.5 rounded-full ${
                  isSelected ? 'bg-blue-500/50' : 'bg-slate-100'
                }`}>
                  <Text className={`text-[10px] font-black ${
                    isSelected ? 'text-white' : 'text-slate-500'
                  }`}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Orders List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : ordersList.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <Receipt size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">No orders found</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-6">
            Swipe down to pull new orders from WooCommerce or adjust search criteria.
          </Text>
        </View>
      ) : (
        <FlatList
          data={ordersList}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={() => {
            if (!loadingMore) return null;
            return (
              <View className="py-4 justify-center items-center">
                <ActivityIndicator size="small" color="#3B82F6" />
              </View>
            );
          }}
          renderItem={({ item }) => {
            const customerName = `${item.billing?.first_name || ''} ${item.billing?.last_name || ''}`.trim() || 'Guest Customer';
            const isPendingOrProcessing = item.status === 'pending' || item.status === 'processing' || item.status === 'on-hold';

            return (
              <Pressable
                onPress={() => router.push(`/orders/${item.id}`)}
                className="bg-white border border-slate-200 rounded-2xl mb-3.5 overflow-hidden shadow-sm shadow-slate-100 active:bg-slate-50"
              >
                <View className="p-4 flex-row justify-between items-start">
                  <View className="flex-1 pr-3">
                    <View className="flex-row items-center gap-2.5 mb-1.5">
                      <Text className="text-slate-900 font-extrabold text-base">#{item.number}</Text>
                      <View className={`px-2 py-0.5 rounded-full ${getStatusColor(item.status)}`}>
                        <Text className="text-[10px] font-extrabold uppercase tracking-wide">
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    
                    <Text className="text-slate-700 font-bold text-sm mb-0.5" numberOfLines={1}>
                      {customerName}
                    </Text>

                    {item.billing?.address_1 && (
                      <Text className="text-slate-500 text-xs mb-0.5" numberOfLines={1}>
                        {[item.billing.address_1, item.billing.city].filter(Boolean).join(', ')}
                      </Text>
                    )}

                    {item.billing?.phone && (
                      <Text className="text-slate-500 text-xs mb-1" numberOfLines={1}>
                        {item.billing.phone}
                      </Text>
                    )}
                    
                    <View className="flex-row items-center gap-1.5">
                      <Clock size={12} color="#94A3B8" />
                      <Text className="text-slate-500 text-xs font-medium">
                        {formatDate(item.dateCreated)}
                      </Text>
                    </View>
                  </View>

                  <View className="items-end">
                    <Text className="text-slate-900 font-black text-base">
                      {getCurrencySymbol(item.currency)}{Number(item.total).toFixed(2)}
                    </Text>
                    <Text className="text-slate-400 text-[10px] uppercase font-bold mt-0.5">
                      {item.currency}
                    </Text>
                  </View>
                </View>

                {/* Quick Action Bar (Only for actionable statuses) */}
                {isPendingOrProcessing && (
                  <View className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex-row items-center justify-between">
                    <View className="flex-row gap-2">
                      {item.billing?.phone && (
                        <Pressable 
                          onPress={() => openURL(`tel:${item.billing.phone}`)} 
                          className="w-9 h-9 bg-blue-100/50 rounded-lg items-center justify-center active:bg-blue-200/50"
                        >
                          <Phone size={14} color="#3B82F6" />
                        </Pressable>
                      )}
                      {item.billing?.phone && (
                        <Pressable 
                          onPress={() => openURL(`whatsapp://send?phone=${item.billing.phone}`)} 
                          className="w-9 h-9 bg-emerald-100/50 rounded-lg items-center justify-center active:bg-emerald-200/50"
                        >
                          <MessageSquare size={14} color="#10B981" />
                        </Pressable>
                      )}
                      {item.billing?.email && (
                        <Pressable 
                          onPress={() => openURL(`mailto:${item.billing.email}`)} 
                          className="w-9 h-9 bg-amber-100/50 rounded-lg items-center justify-center active:bg-amber-200/50"
                        >
                          <Mail size={14} color="#F59E0B" />
                        </Pressable>
                      )}
                    </View>

                    <View className="flex-row items-center gap-2">
                      <Pressable 
                        onPress={() => handleQuickCancel(item.id)}
                        className="flex-row items-center bg-white border border-red-200 px-3 py-1.5 rounded-lg active:bg-red-50"
                      >
                        <X size={14} color="#EF4444" strokeWidth={3} />
                        <Text className="text-red-500 font-bold text-xs ml-1.5">Cancel</Text>
                      </Pressable>

                      <Pressable 
                        onPress={() => handleQuickComplete(item.id)}
                        className="flex-row items-center bg-emerald-500 px-3 py-1.5 rounded-lg active:bg-emerald-600 shadow-sm shadow-emerald-500/30"
                      >
                        <Check size={14} color="#FFFFFF" strokeWidth={3} />
                        <Text className="text-white font-bold text-xs ml-1.5">Complete</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

    </View>
  );
}
