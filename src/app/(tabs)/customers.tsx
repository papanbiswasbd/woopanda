import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { Search, Users, ChevronRight, DollarSign } from 'lucide-react-native';

export default function CustomersScreen() {
  const router = useRouter();
  
  const [customerList, setCustomerList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Retrieve cached customers from SQLite ordered by LTV
  const loadLocalCustomers = useCallback(async () => {
    try {
      let rows: any[] = [];
      const queryParams: any[] = [];
      let queryStr = `SELECT id, first_name as firstName, last_name as lastName, email, total_spent as totalSpent, orders_count as ordersCount FROM customers`;

      const query = debouncedSearchQuery.trim();
      if (query.length > 0) {
        queryStr += ` WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?`;
        const term = `%${query}%`;
        queryParams.push(term, term, term);
      }

      queryStr += ` ORDER BY CAST(total_spent AS REAL) DESC`;

      rows = await sqlite.getAllAsync<any>(queryStr, ...queryParams);

      const parsed = rows.map((r: any) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        totalSpent: r.totalSpent || '0.00',
        ordersCount: r.ordersCount || 0,
      }));

      setCustomerList(parsed);
    } catch (error) {
      console.error('Failed to load local cached customers:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery]);

  const loadLocalCustomersRef = useRef(loadLocalCustomers);
  useEffect(() => {
    loadLocalCustomersRef.current = loadLocalCustomers;
  }, [loadLocalCustomers]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadLocalCustomersRef.current();
  }, [debouncedSearchQuery]);

  // Sync cache and refresh UI on focus
  useFocusEffect(
    useCallback(() => {
      loadLocalCustomersRef.current();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncCustomers();
    loadLocalCustomers();
    setRefreshing(false);
  };

  const getInitials = (first: string, last: string) => {
    const f = first ? first.charAt(0) : '';
    const l = last ? last.charAt(0) : '';
    return (f + l).toUpperCase() || 'C';
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
            placeholder="Search customers by name or email..."
            placeholderTextColor="#64748B"
            autoCorrect={false}
            className="flex-1 text-slate-900 ml-2.5 text-sm h-full"
          />
        </View>
      </View>

      {/* Customers List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : customerList.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <Users size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">No customers found</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-6">
            Swipe down to pull customers from WooCommerce or change search query.
          </Text>
        </View>
      ) : (
        <FlatList
          data={customerList}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/customers/${item.id}`)}
              className="bg-white border border-slate-200 rounded-2xl p-4 mb-3.5 flex-row justify-between items-center active:bg-slate-150"
            >
              
              <View className="flex-row items-center gap-3.5 flex-1 pr-4">
                
                {/* Avatar Icon */}
                <View className="w-11 h-11 bg-blue-600/10 rounded-full items-center justify-center border border-blue-500/20">
                  <Text className="text-blue-400 font-extrabold text-sm">
                    {getInitials(item.firstName, item.lastName)}
                  </Text>
                </View>

                {/* Details */}
                <View className="flex-1">
                  <Text className="text-slate-900 font-bold text-sm" numberOfLines={1}>
                    {`${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Guest Buyer'}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-1" numberOfLines={1}>
                    {item.email || 'No email profile'}
                  </Text>
                  <Text className="text-slate-600 text-[10px] font-semibold mt-1 uppercase tracking-wider">
                    {item.ordersCount} Total Orders
                  </Text>
                </View>

              </View>

              <View className="flex-row items-center gap-2">
                <View className="items-end">
                  <Text className="text-emerald-400 font-extrabold text-sm">
                    ${Number(item.totalSpent).toFixed(2)}
                  </Text>
                  <Text className="text-slate-500 text-[9px] uppercase font-bold mt-1">
                    LTV SPENT
                  </Text>
                </View>
                <ChevronRight size={16} color="#475569" />
              </View>

            </Pressable>
          )}
        />
      )}

    </View>
  );
}
