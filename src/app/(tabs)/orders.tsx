import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { Search, Receipt, ChevronRight, Filter, Clock, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { getCurrencySymbol } from '../../shared/store/settingsStore';

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
  { label: 'On Hold', value: 'on-hold' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const lastLoadedPageRef = useRef(0);
  const isInitialMount = useRef(true);

  // Sync route parameter filter when active
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

  // Retrieve cached orders from SQLite
  const loadLocalOrders = useCallback((pageToLoad: number, isRefresh: boolean = false) => {
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
        whereClauses.push(`status = ?`);
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

      rows = sqlite.getAllSync<any>(queryStr, ...queryParams);

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
    } catch (error) {
      console.error('Failed to load local cached orders:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchQuery, selectedStatus]);

  // Load page 1 on filter/search changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadLocalOrders(1);
  }, [debouncedSearchQuery, selectedStatus]);

  // Sync caches and reload UI on focus (does not trigger on filter/search updates while screen is active)
  useFocusEffect(
    useCallback(() => {
      loadLocalOrders(1);
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncOrders();
    loadLocalOrders(1, true);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    loadLocalOrders(page + 1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-blue-400 bg-blue-500/10';
      case 'completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'pending': return 'text-amber-400 bg-amber-500/10';
      case 'on-hold': return 'text-purple-400 bg-purple-500/10';
      case 'cancelled': return 'text-red-400 bg-red-500/10';
      default: return 'text-slate-600 bg-slate-100';
    }
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
      <View className="mb-4">
        <FlatList
          data={STATUS_OPTIONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedStatus(item.value)}
              className={`px-4 py-2 rounded-full mr-2.5 border ${
                selectedStatus === item.value 
                  ? 'bg-blue-600 border-blue-500 shadow-md shadow-blue-500/20' 
                  : 'bg-white border-slate-200'
              }`}
            >
              <Text className={`text-xs font-bold ${
                selectedStatus === item.value ? 'text-slate-900' : 'text-slate-600'
              }`}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
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
            let dateStr = 'Unknown date';
            if (item.dateCreated) {
              try {
                const normalized = item.dateCreated.replace(' ', 'T');
                const parsedDate = new Date(normalized);
                if (!isNaN(parsedDate.getTime())) {
                  dateStr = parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                } else {
                  dateStr = item.dateCreated;
                }
              } catch {
                dateStr = item.dateCreated;
              }
            }

            return (
              <Pressable
                onPress={() => router.push(`/orders/${item.id}`)}
                className="bg-white border border-slate-200 rounded-2xl p-4 mb-3.5 flex-row justify-between items-center active:bg-slate-150"
              >
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-2.5">
                    <Text className="text-slate-900 font-extrabold text-sm">#{item.number}</Text>
                    <View className={`px-2 py-0.5 rounded-full ${getStatusColor(item.status)}`}>
                      <Text className="text-[10px] font-extrabold uppercase tracking-wide">
                        {item.status}
                      </Text>
                    </View>
                  </View>
                  
                  <Text className="text-slate-700 font-bold text-xs mt-2" numberOfLines={1}>
                    {item.billing?.first_name} {item.billing?.last_name || 'Guest Customer'}
                  </Text>
                  
                  <Text className="text-slate-500 text-[10px] mt-1 font-medium">
                    {dateStr}
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  <View className="items-end">
                    <Text className="text-slate-900 font-extrabold text-sm">
                      {getCurrencySymbol(item.currency)}{Number(item.total).toFixed(2)}
                    </Text>
                    <Text className="text-slate-500 text-[9px] uppercase font-bold mt-1">
                      {item.currency}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#475569" />
                </View>

              </Pressable>
            );
          }}
        />
      )}

    </View>
  );
}
