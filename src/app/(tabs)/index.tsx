import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Modal, useColorScheme, Animated, Easing, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { 
  TrendingUp, ShoppingBag, AlertTriangle, ChevronRight, 
  RefreshCw, Calendar, Users, Receipt, Trophy, BarChart3, Tag, Package, Clock, Star, X, Layers, PieChart
} from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';

interface DashboardStats {
  revenueTotal: number;
  discountTotal: number;
  shippingTotal: number;
  ordersCount: number;
  averageOrderValue: number;
  customersCount: number;
  productsCount: number;
  lowStockCount: number;
  actionableOrdersCount: number;
  statusCounts: Record<string, number>;
  recentOrders: any[];
  topProducts: any[];
  weeklyChartData: { day: string; amount: number }[];
}

const FILTER_OPTIONS = [
  { label: 'All Data', value: 'all_data' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Month', value: 'this_month' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Last Year', value: 'last_year' },
  { label: 'Custom Range...', value: 'custom' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  
  const { orderStatuses, lowStockThreshold, lastDatabaseUpdate, defaultTimeRange = 'all_data', setDefaultTimeRange } = useSettingsStore();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filter States
  const [selectedRange, setSelectedRange] = useState<string>(defaultTimeRange || 'all_data');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  
  // Modals Visibility
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [selectedBreakdownProduct, setSelectedBreakdownProduct] = useState<any | null>(null);

  // Calendar State
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const spinValue = useRef(new Animated.Value(0)).current;
  const isLoadingData = useRef(false);

  // Manual Sync Spinning Animation
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

  // Calculate Date Ranges without timezone cutoff bugs
  const getRangeDetails = useCallback(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = 'All Data';
    let groupType: 'hour' | 'day' | 'month' = 'month';
    let isAllData = false;

    switch (selectedRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        label = 'Today';
        groupType = 'hour';
        break;
      case 'last_7_days':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        label = 'Last 7 Days';
        groupType = 'day';
        break;
      case 'this_week':
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);
        label = 'This Week';
        groupType = 'day';
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        label = 'Last Month';
        groupType = 'day';
        break;
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        label = 'This Month';
        groupType = 'day';
        break;
      case 'all_data':
      default:
        start = new Date(0);
        label = 'All Data';
        groupType = 'month';
        isAllData = true;
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        label = 'This Year';
        groupType = 'month';
        break;
      case 'last_year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        label = 'Last Year';
        groupType = 'month';
        break;
      case 'custom':
        if (customStart) start = new Date(customStart);
        if (customEnd) end = new Date(customEnd);
        label = 'Custom Range';
        const diffDays = Math.ceil(Math.abs((customEnd?.getTime() || 0) - (customStart?.getTime() || 0)) / (1000 * 60 * 60 * 24));
        groupType = diffDays > 60 ? 'month' : 'day';
        break;
    }

    const formatSqlDate = (d: Date, isEndDate: boolean) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      if (groupType === 'hour' && !isEndDate) {
        return `${year}-${month}-${dayStr}`; // match YYYY-MM-DD prefix for today
      }
      return isEndDate ? `${year}-${month}-${dayStr} 23:59:59` : `${year}-${month}-${dayStr} 00:00:00`;
    };

    const startStr = formatSqlDate(start, false);
    let endStr = '9999-12-31 23:59:59'; // Ensure newest orders across timezone differences are never cut off

    if (selectedRange === 'last_month' || selectedRange === 'last_year' || selectedRange === 'custom') {
      endStr = formatSqlDate(end, true);
    }
    
    return {
      startStr,
      endStr,
      label,
      groupType,
      isAllData,
    };
  }, [selectedRange, customStart, customEnd]);

  // Compile business analytics dynamically from local SQLite DB
  const loadDashboardData = useCallback(async () => {
    if (isLoadingData.current) return;
    isLoadingData.current = true;
    try {
      const { startStr, endStr, groupType, isAllData } = getRangeDetails();
      const threshold = lowStockThreshold || 5;

      // 1. Financial revenues & discounts
      const finRows = isAllData
        ? await sqlite.getAllAsync<{ revSum: number | null; discSum: number | null; shipSum: number | null; count: number }>(
            `SELECT 
               SUM(CAST(total AS REAL)) as revSum, 
               SUM(CAST(discount_total AS REAL)) as discSum, 
               SUM(CAST(shipping_total AS REAL)) as shipSum, 
               COUNT(*) as count 
             FROM orders 
             WHERE status != 'cancelled' AND status != 'failed'`
          )
        : await sqlite.getAllAsync<{ revSum: number | null; discSum: number | null; shipSum: number | null; count: number }>(
            `SELECT 
               SUM(CAST(total AS REAL)) as revSum, 
               SUM(CAST(discount_total AS REAL)) as discSum, 
               SUM(CAST(shipping_total AS REAL)) as shipSum, 
               COUNT(*) as count 
             FROM orders 
             WHERE date_created >= ? AND date_created <= ? AND status != 'cancelled' AND status != 'failed'`,
            startStr, endStr
          );
      const fin = finRows[0] || { revSum: 0, discSum: 0, shipSum: 0, count: 0 };
      const revenueTotal = fin.revSum || 0;
      const discountTotal = fin.discSum || 0;
      const shippingTotal = fin.shipSum || 0;

      // 2. Total orders count in range (Matches Orders screen exactly when on All Data)
      const ordTotal = isAllData
        ? await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders`)
        : await sqlite.getAllAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM orders WHERE date_created >= ? AND date_created <= ?`,
            startStr, endStr
          );
      const ordersCount = ordTotal[0]?.count || 0;
      const averageOrderValue = ordersCount > 0 ? (revenueTotal / ordersCount) : 0;

      // 3. Dynamic Status Counts (Groups all custom & native order statuses, matches Orders tab exactly)
      const statusRows = isAllData
        ? await sqlite.getAllAsync<{ status: string; count: number }>(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`)
        : await sqlite.getAllAsync<{ status: string; count: number }>(
            `SELECT status, COUNT(*) as count FROM orders WHERE date_created >= ? AND date_created <= ? GROUP BY status`,
            startStr, endStr
          );
      const statusCounts: Record<string, number> = {};
      let allOrdersTotal = 0;
      statusRows.forEach((r) => {
        const s = String(r.status || '').toLowerCase();
        statusCounts[s] = r.count;
        allOrdersTotal += r.count;
      });
      statusCounts['all'] = allOrdersTotal;

      // 4. Store Health KPIs: Customers & Catalog
      const custRows = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM customers`);
      const customersCount = custRows[0]?.count || 0;

      const prodRows = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM products`);
      const productsCount = prodRows[0]?.count || 0;

      const lowStockRows = await sqlite.getAllAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM products WHERE manage_stock = 1 AND stock_quantity <= ?`, 
        threshold
      );
      const lowStockCount = lowStockRows[0]?.count || 0;

      const actionRows = await sqlite.getAllAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'processing', 'on-hold')`
      );
      const actionableOrdersCount = actionRows[0]?.count || 0;

      // 5. Recent Orders Stream (Always latest real orders)
      let recentOrdersRows = isAllData
        ? await sqlite.getAllAsync<{ id: number; number: string; total: string; status: string; date_created: string; billing: string }>(
            `SELECT id, number, total, status, date_created, billing FROM orders ORDER BY date_created DESC LIMIT 5`
          )
        : await sqlite.getAllAsync<{ id: number; number: string; total: string; status: string; date_created: string; billing: string }>(
            `SELECT id, number, total, status, date_created, billing FROM orders WHERE date_created >= ? AND date_created <= ? ORDER BY date_created DESC LIMIT 5`,
            startStr, endStr
          );
      if (recentOrdersRows.length === 0) {
        recentOrdersRows = await sqlite.getAllAsync<{ id: number; number: string; total: string; status: string; date_created: string; billing: string }>(
          `SELECT id, number, total, status, date_created, billing FROM orders ORDER BY date_created DESC LIMIT 5`
        );
      }
      const recentOrders = recentOrdersRows.map((row) => {
        let billingObj = {};
        try {
          billingObj = row.billing ? JSON.parse(row.billing) : {};
        } catch {}
        return {
          id: row.id,
          number: row.number,
          total: row.total,
          status: row.status,
          dateCreated: row.date_created,
          billing: billingObj,
        };
      });

      // 6. Smart Product Breakdown Engine across ALL Order Statuses
      const orderLinesRows = isAllData
        ? await sqlite.getAllAsync<{ line_items: string; status: string }>(
            `SELECT line_items, status FROM orders`
          )
        : await sqlite.getAllAsync<{ line_items: string; status: string }>(
            `SELECT line_items, status FROM orders WHERE date_created >= ? AND date_created <= ?`,
            startStr, endStr
          );
      
      const productSalesMap = new Map<number, { 
        name: string; 
        quantity: number; 
        totalQuantityAll: number; 
        revenue: number; 
        price: number; 
        productId: number; 
        statusBreakdown: Record<string, { count: number; revenue: number }> 
      }>();

      orderLinesRows.forEach((o) => {
        if (!o.line_items) return;
        const ordStatus = (o.status || 'unknown').toLowerCase().replace('wc-', '');
        try {
          const items = JSON.parse(o.line_items);
          if (Array.isArray(items)) {
            items.forEach((item: any) => {
              const pid = item.product_id || item.id;
              if (!pid) return;
              const parsedQty = parseInt(String(item.quantity ?? item.qty ?? 0), 10);
              const qty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
              const lineTotal = Number(item.total || item.subtotal) || 0;
              const existing = productSalesMap.get(pid) || { 
                name: item.name || `Product #${pid}`, 
                quantity: 0, 
                totalQuantityAll: 0,
                revenue: 0, 
                price: Number(item.price) || (lineTotal / qty),
                productId: pid,
                statusBreakdown: {} as Record<string, { count: number; revenue: number }>
              };

              existing.totalQuantityAll += qty;
              if (ordStatus !== 'cancelled' && ordStatus !== 'failed' && ordStatus !== 'trash') {
                existing.quantity += qty;
                existing.revenue += lineTotal;
              }

              if (!existing.statusBreakdown[ordStatus]) {
                existing.statusBreakdown[ordStatus] = { count: 0, revenue: 0 };
              }
              existing.statusBreakdown[ordStatus].count += qty;
              existing.statusBreakdown[ordStatus].revenue += lineTotal;

              productSalesMap.set(pid, existing);
            });
          }
        } catch {}
      });

      let topProductsList = Array.from(productSalesMap.values()).sort((a, b) => (b.totalQuantityAll || b.quantity || 0) - (a.totalQuantityAll || a.quantity || 0) || b.revenue - a.revenue).slice(0, 8);
      
      // Enrich with image and real stock from products table
      const topProducts: any[] = [];
      for (const p of topProductsList) {
        const pDb = await sqlite.getAllAsync<any>(`SELECT id, name, price, stock_quantity, stock_status, images FROM products WHERE id = ? LIMIT 1`, p.productId);
        let imgSrc = null;
        let stockQty = null;
        let stockStatus = 'instock';
        if (pDb && pDb.length > 0) {
          try {
            const imgs = pDb[0].images ? JSON.parse(pDb[0].images) : [];
            imgSrc = imgs[0]?.src || null;
          } catch {}
          stockQty = pDb[0].stock_quantity;
          stockStatus = pDb[0].stock_status || 'instock';
        }
        topProducts.push({
          id: p.productId,
          name: p.name,
          price: p.price,
          quantitySold: p.quantity,
          totalQuantityAll: p.totalQuantityAll,
          revenueGenerated: p.revenue,
          image: imgSrc,
          stockQuantity: stockQty,
          stockStatus: stockStatus,
          statusBreakdown: p.statusBreakdown,
        });
      }

      // Fallback if no sales items in current timeframe: show top active catalog products
      if (topProducts.length === 0) {
        const defaultProds = await sqlite.getAllAsync<any>(`SELECT id, name, price, stock_quantity, stock_status, images FROM products WHERE purchasable = 1 AND stock_status = 'instock' LIMIT 5`);
        for (const dp of defaultProds) {
          let imgSrc = null;
          try {
            const imgs = dp.images ? JSON.parse(dp.images) : [];
            imgSrc = imgs[0]?.src || null;
          } catch {}
          topProducts.push({
            id: dp.id,
            name: dp.name || `Product #${dp.id}`,
            price: Number(dp.price || 0),
            quantitySold: 0,
            totalQuantityAll: 0,
            revenueGenerated: 0,
            image: imgSrc,
            stockQuantity: dp.stock_quantity,
            stockStatus: dp.stock_status || 'instock',
            statusBreakdown: {},
            isCatalogHighlight: true,
          });
        }
      }

      // 7. Chart compilation
      const chartRows = isAllData
        ? await sqlite.getAllAsync<{ label: string; total_sum: number | null }>(
            `SELECT strftime('%m', date_created) as label, SUM(CAST(total AS REAL)) as total_sum FROM orders WHERE status != 'cancelled' AND status != 'failed' GROUP BY label ORDER BY label ASC`
          )
        : await sqlite.getAllAsync<{ label: string; total_sum: number | null }>(
            groupType === 'hour'
              ? `SELECT strftime('%H', date_created) as label, SUM(CAST(total AS REAL)) as total_sum FROM orders WHERE date_created >= ? AND date_created <= ? AND status != 'cancelled' AND status != 'failed' GROUP BY label ORDER BY label ASC`
              : groupType === 'month'
                ? `SELECT strftime('%m', date_created) as label, SUM(CAST(total AS REAL)) as total_sum FROM orders WHERE date_created >= ? AND date_created <= ? AND status != 'cancelled' AND status != 'failed' GROUP BY label ORDER BY label ASC`
                : `SELECT date(date_created) as label, SUM(CAST(total AS REAL)) as total_sum FROM orders WHERE date_created >= ? AND date_created <= ? AND status != 'cancelled' AND status != 'failed' GROUP BY label ORDER BY label ASC`,
            startStr, endStr
          );

      const chartMap = new Map<string, number>();
      
      if (groupType === 'hour') {
        for (let h = 0; h < 24; h++) {
          chartMap.set(String(h).padStart(2, '0'), 0);
        }
      } else if (groupType === 'month') {
        for (let m = 1; m <= 12; m++) {
          chartMap.set(String(m).padStart(2, '0'), 0);
        }
      } else {
        const sDate = new Date(startStr);
        const eDate = new Date(endStr);
        const diffDays = Math.ceil(Math.abs(eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24));
        const step = diffDays > 30 ? Math.ceil(diffDays / 15) : 1;
        for (let i = 0; i <= diffDays; i += step) {
          const d = new Date(sDate.getTime() + i * 24 * 60 * 60 * 1000);
          chartMap.set(d.toISOString().split('T')[0], 0);
        }
      }

      chartRows.forEach((row) => {
        if (row.label) {
          chartMap.set(row.label, Number(row.total_sum || 0));
        }
      });

      const weeklyChartData = Array.from(chartMap.entries()).map(([labelKey, val]) => {
        let label = labelKey;
        if (groupType === 'hour') {
          label = `${labelKey}:00`;
        } else if (groupType === 'month') {
          const idx = Number(labelKey) - 1;
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          label = monthNames[idx] || labelKey;
        } else {
          const d = new Date(labelKey);
          label = isNaN(d.getTime()) ? labelKey : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return {
          day: label,
          amount: val,
        };
      });

      setStats({
        revenueTotal,
        discountTotal,
        shippingTotal,
        ordersCount,
        averageOrderValue,
        customersCount,
        productsCount,
        lowStockCount,
        actionableOrdersCount,
        statusCounts,
        recentOrders,
        topProducts,
        weeklyChartData,
      });
    } catch (error) {
      console.error('Failed to compile dashboard analytics:', error);
    } finally {
      isLoadingData.current = false;
      setLoading(false);
    }
  }, [getRangeDetails, lowStockThreshold]);

  // Sync data automatically in the background on mount and subscribe to DB updates
  useEffect(() => {
    async function initialSync() {
      await syncService.syncAll();
      loadDashboardData();
    }
    initialSync();

    // Poll SQLite database records every 3 seconds to keep metrics dynamic
    const interval = setInterval(loadDashboardData, 3000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  // Reactive reload whenever settings or database sync completes
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, lastDatabaseUpdate]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncAll();
    loadDashboardData();
    setRefreshing(false);
  };

  const triggerManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncService.syncAll();
      loadDashboardData();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Configure Header buttons dynamically
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-2 mr-4">
          <Pressable 
            onPress={() => setFilterModalVisible(true)}
            className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-lg items-center justify-center active:bg-slate-200"
          >
            <Calendar size={16} color="#475569" />
          </Pressable>
          
          <Pressable 
            onPress={triggerManualSync}
            disabled={syncing}
            className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-lg items-center justify-center active:bg-slate-200"
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={15} color="#3B82F6" />
            </Animated.View>
          </Pressable>
        </View>
      )
    });
  }, [navigation, selectedRange, customStart, customEnd, syncing, spin]);

  const handleDatePress = (date: Date) => {
    if (!customStart) {
      setCustomStart(date);
      setCustomEnd(null);
    } else if (!customEnd) {
      if (date < customStart) {
        setCustomStart(date);
      } else {
        setCustomEnd(date);
      }
    } else {
      setCustomStart(date);
      setCustomEnd(null);
    }
  };

  const formatCurrency = (amount: number) => {
    const storeCurrency = useSettingsStore.getState().currency || 'USD';
    const symbol = getCurrencySymbol(storeCurrency);
    try {
      const numStr = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
      return `${symbol}${numStr}`;
    } catch {
      return `${symbol}${amount.toFixed(2)}`;
    }
  };

  // Dynamic Status Carousel Items (Adapts to all native + custom WooCommerce statuses)
  const statusCarouselData = useMemo(() => {
    const dotColors: Record<string, string> = {
      all: 'bg-indigo-500',
      pending: 'bg-amber-500',
      processing: 'bg-blue-500',
      'on-hold': 'bg-orange-500',
      completed: 'bg-emerald-500',
      cancelled: 'bg-red-500',
      refunded: 'bg-purple-500',
      failed: 'bg-rose-500',
      shipped: 'bg-teal-500',
      delivering: 'bg-cyan-500',
    };

    const defaultStatuses = [
      { label: 'Pending', value: 'pending' },
      { label: 'Processing', value: 'processing' },
      { label: 'On Hold', value: 'on-hold' },
      { label: 'Completed', value: 'completed' },
      { label: 'Cancelled', value: 'cancelled' },
      { label: 'Refunded', value: 'refunded' },
      { label: 'Failed', value: 'failed' },
    ];

    const storeStatuses = (orderStatuses && orderStatuses.length > 0) ? orderStatuses : defaultStatuses;
    const allOptions = [{ label: 'All Orders', value: 'all' }, ...storeStatuses];

    const items = allOptions.map((item, index) => {
      const val = item.value.toLowerCase();
      const dotClass = dotColors[val] || ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500'][index % 4];
      return {
        label: item.label,
        value: val,
        count: stats?.statusCounts?.[val] || 0,
        dotClass,
      };
    }).filter(item => item.count > 0);

    if (items.length === 0) {
      return [{ label: 'All Orders', value: 'all', count: 0, dotClass: 'bg-indigo-500' }];
    }

    return items;
  }, [orderStatuses, stats?.statusCounts]);

  const renderCalendar = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<View key={`empty-${i}`} className="w-9 h-9" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const currentDay = new Date(calendarYear, calendarMonth, d);
      const isStart = customStart && currentDay.toDateString() === customStart.toDateString();
      const isEnd = customEnd && currentDay.toDateString() === customEnd.toDateString();
      const isInRange = customStart && customEnd && currentDay > customStart && currentDay < customEnd;

      let cellClass = "w-9 h-9 items-center justify-center rounded mt-1.5 ";
      let textClass = "text-slate-800 text-xs font-semibold ";

      if (isStart || isEnd) {
        cellClass += "bg-blue-600 ";
        textClass += "text-white ";
      } else if (isInRange) {
        cellClass += "bg-blue-50 ";
        textClass += "text-blue-600 ";
      } else {
        cellClass += "active:bg-slate-100 ";
      }

      days.push(
        <Pressable key={`day-${d}`} onPress={() => handleDatePress(currentDay)} className={cellClass}>
          <Text className={textClass}>{d}</Text>
        </Pressable>
      );
    }

    return (
      <View className="bg-white border border-slate-200 rounded-lg p-5 shadow-xl w-80">
        <View className="flex-row justify-between items-center mb-4">
          <Pressable 
            onPress={() => {
              if (calendarMonth === 0) {
                setCalendarMonth(11);
                setCalendarYear(prev => prev - 1);
              } else {
                setCalendarMonth(prev => prev - 1);
              }
            }}
            className="p-2 active:bg-slate-100 rounded"
          >
            <ChevronRight size={16} className="rotate-180" color="#475569" />
          </Pressable>
          <Text className="text-slate-800 font-bold text-base">
            {monthNames[calendarMonth]} {calendarYear}
          </Text>
          <Pressable 
            onPress={() => {
              if (calendarMonth === 11) {
                setCalendarMonth(0);
                setCalendarYear(prev => prev + 1);
              } else {
                setCalendarMonth(prev => prev + 1);
              }
            }}
            className="p-2 active:bg-slate-100 rounded"
          >
            <ChevronRight size={16} color="#475569" />
          </Pressable>
        </View>

        <View className="flex-row justify-between border-b border-slate-100 pb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <Text key={day} className="w-9 text-center text-slate-400 text-xs font-bold">
              {day}
            </Text>
          ))}
        </View>

        <View className="flex-row flex-wrap mt-1">
          {days}
        </View>

        <View className="mt-5 border-t border-slate-100 pt-3">
          <Text className="text-slate-600 text-xs font-medium">
            Start: {customStart ? customStart.toLocaleDateString() : 'Not selected'}{'\n'}
            End: {customEnd ? customEnd.toLocaleDateString() : 'Not selected'}
          </Text>
          
          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={() => {
                setCustomStart(null);
                setCustomEnd(null);
              }}
              className="flex-1 bg-slate-100 h-10 rounded-lg items-center justify-center active:bg-slate-200"
            >
              <Text className="text-slate-600 font-bold text-sm">Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (customStart && customEnd) {
                  setSelectedRange('custom');
                  setCalendarModalVisible(false);
                  setFilterModalVisible(false);
                } else {
                  Alert.alert('Incomplete selection', 'Please select both start and end dates.');
                }
              }}
              className="flex-1 bg-blue-600 h-10 rounded-lg items-center justify-center active:bg-blue-700 shadow-sm shadow-blue-500/30"
            >
              <Text className="text-white font-bold text-sm">Apply Range</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-slate-600 mt-3 font-semibold text-sm">Compiling Business Analytics...</Text>
      </View>
    );
  }

  const rangeDetails = getRangeDetails();
  const rangeLabel = rangeDetails.label;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
      <ScrollView 
        className="flex-grow bg-slate-50" 
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
        }
      >
        {/* 1. Executive Financial Summary (Hero Card) */}
        <View className="px-5 pt-4">
          <View className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg shadow-slate-900/20">
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text className="text-slate-400 text-xs font-extrabold uppercase tracking-wider">Total Revenue ({rangeLabel})</Text>
                <Text className="text-2xl font-black text-white mt-1">
                  {formatCurrency(stats?.revenueTotal || 0)}
                </Text>
              </View>
              <View className="bg-blue-500/20 p-3 rounded-lg border border-blue-500/30">
                <TrendingUp size={24} color="#3B82F6" />
              </View>
            </View>
            
            <View className="flex-row justify-between border-t border-slate-800/80 pt-4 mt-1">
              <View className="flex-1 border-r border-slate-800 pr-3">
                <Text className="text-slate-400 text-[11px] font-semibold">Orders</Text>
                <Text className="text-white font-extrabold text-lg mt-0.5">
                  {stats?.ordersCount || 0}
                </Text>
              </View>
              <View className="flex-1 pl-4">
                <Text className="text-slate-400 text-[11px] font-semibold">Avg. Order Value</Text>
                <Text className="text-white font-extrabold text-lg mt-0.5">
                  {formatCurrency(stats?.averageOrderValue || 0)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 2. Order Status Pipeline (3-Column Auto-Adjusting Grid) */}
        <View className="pt-6 mb-2 px-5">
          <View className="flex-row items-center justify-between mb-3.5">
            <Text className="text-slate-800 font-black text-sm uppercase tracking-wider">Order Status Pipeline</Text>
            <Text className="text-slate-400 text-xs font-semibold">Tap to filter</Text>
          </View>
          <View className="flex-row flex-wrap" style={{ gap: 5 }}>
            {statusCarouselData.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => {
                  if (item.value === 'all') {
                    router.navigate('/orders?filter=all');
                  } else {
                    router.navigate(`/orders?filter=${item.value}`);
                  }
                }}
                style={{ width: '32.2%' }}
                className="bg-white border border-slate-200/90 rounded-lg p-3 items-center justify-center shadow-sm shadow-slate-100 active:bg-slate-50"
              >
                <Text className="text-slate-900 font-black text-xl leading-none">{item.count}</Text>
                <Text className="text-slate-600 text-[11px] font-extrabold mt-1 text-center" numberOfLines={1}>
                  {item.label}
                </Text>
                <View className={`w-6 h-1.5 rounded mt-2.5 ${item.dotClass}`} />
              </Pressable>
            ))}
          </View>
        </View>

        <View className="px-5 pt-4">
          {/* 3. Smart Product Breakdown (Business Insight) */}
          <View className="bg-white border border-slate-200/90 rounded-lg p-5 mb-6 shadow-sm shadow-slate-100">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <View className="bg-blue-500/10 p-2 rounded-lg">
                  <PieChart size={16} color="#3B82F6" />
                </View>
                <Text className="text-slate-800 font-black text-sm">Product Breakdown ({rangeLabel})</Text>
              </View>
              <Pressable onPress={() => router.navigate('/products')}>
                <Text className="text-blue-600 font-bold text-xs">View Catalog</Text>
              </Pressable>
            </View>

            {(!stats?.topProducts || stats.topProducts.length === 0) ? (
              <View className="items-center py-6">
                <Package size={32} color="#CBD5E1" />
                <Text className="text-slate-500 text-xs font-medium mt-2">No product activity in this timeframe.</Text>
              </View>
            ) : (
              <View className="divide-y divide-slate-100">
                {stats.topProducts.map((prod, idx) => (
                  <Pressable
                    key={`prod-${prod.id}-${idx}`}
                    onPress={() => setSelectedBreakdownProduct(prod)}
                    className="py-3.5 flex-row items-center justify-between active:opacity-75"
                  >
                    <View className="flex-row items-center flex-1 pr-3 gap-3">
                      <View className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden justify-center items-center border border-slate-200/80">
                        {prod.image ? (
                          <ExpoImage 
                            source={{ uri: prod.image }} 
                            style={{ width: '100%', height: '100%' }}
                            transition={200}
                          />
                        ) : (
                          <Package size={20} color="#94A3B8" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-900 font-bold text-sm" numberOfLines={1}>{prod.name}</Text>
                        <View className="flex-row items-center gap-2 mt-1">
                          <Text className="text-slate-500 text-xs font-semibold">{formatCurrency(prod.price)}</Text>
                          {prod.stockQuantity !== null && (
                            <Text className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              prod.stockQuantity <= (lowStockThreshold || 5) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              Stock: {prod.stockQuantity}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    <View className="items-end justify-center">
                      {prod.isCatalogHighlight ? (
                        <View className="bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/60">
                          <Text className="text-slate-700 font-bold text-[11px]">No sales yet</Text>
                        </View>
                      ) : (
                        <>
                          <View className="bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 mb-1">
                            <Text className="text-emerald-700 font-black text-xs">Total Sell: {prod.totalQuantityAll || prod.quantitySold}</Text>
                          </View>
                          <Text className="text-slate-400 font-semibold text-[10px]">Tap for breakdown →</Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* 6. Recent Orders Stream */}
          <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <View className="bg-emerald-500/10 p-2 rounded-lg">
                  <Receipt size={16} color="#10B981" />
                </View>
                <Text className="text-slate-800 font-black text-sm">Recent Orders ({rangeLabel})</Text>
              </View>
              <Pressable onPress={() => router.navigate('/orders')}>
                <Text className="text-blue-600 font-bold text-xs">View All</Text>
              </Pressable>
            </View>

            {(!stats?.recentOrders || stats.recentOrders.length === 0) ? (
              <View className="items-center py-8">
                <Receipt size={36} color="#CBD5E1" />
                <Text className="text-slate-500 text-xs font-semibold mt-2">No orders found in this timeframe.</Text>
              </View>
            ) : (
              <View className="divide-y divide-slate-100">
                {stats.recentOrders.map((order, idx) => (
                  <Pressable 
                    key={order.id}
                    onPress={() => router.push(`/orders/${order.id}` as any)}
                    className="py-3.5 flex-row justify-between items-center active:opacity-70"
                  >
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-slate-900 font-black text-sm">#{order.number}</Text>
                        <View className={`px-2 py-0.5 rounded-md ${
                          order.status === 'processing' ? 'bg-blue-500/10' :
                          order.status === 'completed' ? 'bg-emerald-500/10' :
                          order.status === 'on-hold' ? 'bg-orange-500/10' :
                          order.status === 'pending' ? 'bg-amber-500/10' : 
                          order.status === 'cancelled' || order.status === 'failed' ? 'bg-rose-500/10' : 'bg-slate-100'
                        }`}>
                          <Text className={`text-[10px] font-black uppercase ${
                            order.status === 'processing' ? 'text-blue-600' :
                            order.status === 'completed' ? 'text-emerald-600' :
                            order.status === 'on-hold' ? 'text-orange-600' :
                            order.status === 'pending' ? 'text-amber-600' :
                            order.status === 'cancelled' || order.status === 'failed' ? 'text-rose-600' : 'text-slate-600'
                          }`}>
                            {order.status}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-slate-600 text-xs font-medium mt-1" numberOfLines={1}>
                        {`${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Guest Customer'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-slate-900 font-black text-sm">{formatCurrency(Number(order.total))}</Text>
                      <Text className="text-slate-400 font-semibold text-[11px] mt-0.5">
                        {(() => {
                          if (!order.dateCreated) return 'Unknown';
                          try {
                            const normalized = order.dateCreated.replace(' ', 'T');
                            const parsedDate = new Date(normalized);
                            return isNaN(parsedDate.getTime()) 
                              ? order.dateCreated.split(' ')[0] 
                              : parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                          } catch {
                            return order.dateCreated.split(' ')[0] || 'Unknown';
                          }
                        })()}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable 
              onPress={() => router.navigate('/orders')}
              className="mt-4 bg-slate-100 py-3 rounded-lg items-center active:bg-slate-200"
            >
              <Text className="text-slate-700 font-extrabold text-xs">View Full Order Directory</Text>
            </Pressable>
          </View>

        </View>
      </ScrollView>

      {/* Date Filter Range Picker Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-slate-900/40">
          <View className="bg-white border-t border-slate-200 rounded-t-lg p-6 shadow-2xl max-h-[85%]">
            <View className="w-12 h-1.5 bg-slate-200 rounded self-center mb-3" />
            <Text className="text-slate-900 font-black text-lg text-center">Filter Time Range</Text>
            <Text className="text-slate-500 text-xs font-semibold mt-1 mb-4 text-center px-2">
              Tap an option to filter data, or tap the star ★ to set as your default dashboard view.
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {FILTER_OPTIONS.map((opt) => {
                  const isSelected = selectedRange === opt.value;
                  const isDefault = defaultTimeRange === opt.value;
                  return (
                    <View
                      key={opt.value}
                      className={`${opt.value === 'custom' ? 'w-full' : 'w-[48%]'} rounded-lg border flex-row items-center overflow-hidden ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-500/30' 
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <Pressable
                        onPress={() => {
                          if (opt.value === 'custom') {
                            setCalendarModalVisible(true);
                          } else {
                            setSelectedRange(opt.value);
                            setFilterModalVisible(false);
                          }
                        }}
                        className="flex-1 py-3.5 px-3.5 justify-center active:opacity-80"
                      >
                        <Text className={`text-xs font-extrabold ${
                          isSelected ? 'text-white' : 'text-slate-700'
                        }`} numberOfLines={1}>
                          {opt.label}
                        </Text>
                      </Pressable>

                      {opt.value !== 'custom' && (
                        <Pressable
                          onPress={() => {
                            if (setDefaultTimeRange) {
                              setDefaultTimeRange(opt.value);
                              Alert.alert('Default Saved', `"${opt.label}" is now set as your automatic default dashboard view.`);
                            }
                          }}
                          hitSlop={8}
                          className="py-3 pr-3.5 pl-2 justify-center items-center active:opacity-60"
                        >
                          <Star 
                            size={18} 
                            color={isDefault ? '#F59E0B' : (isSelected ? '#93C5FD' : '#CBD5E1')} 
                            fill={isDefault ? '#F59E0B' : 'transparent'} 
                          />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setFilterModalVisible(false)}
              className="bg-slate-100 h-12 rounded-lg items-center justify-center mt-4 active:bg-slate-200"
            >
              <Text className="text-slate-700 font-extrabold text-sm">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Custom Range Calendar Picker Modal */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-slate-900/50 px-6">
          {renderCalendar()}
        </View>
      </Modal>

      {/* Smart Product Breakdown Bottom Sheet Popup Modal (8px max border radius) */}
      <Modal
        visible={!!selectedBreakdownProduct}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedBreakdownProduct(null)}
      >
        <View className="flex-1 justify-end bg-slate-900/60">
          <Pressable className="flex-1" onPress={() => setSelectedBreakdownProduct(null)} />
          <View className="bg-white rounded-t-lg p-6 border-t border-slate-200 shadow-2xl w-full max-h-[82%]">
            {/* Modal Drag Handle */}
            <View className="w-12 h-1 bg-slate-300 rounded self-center mb-5" />

            {selectedBreakdownProduct && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                {/* Product Profile Header */}
                <View className="flex-row items-start justify-between border-b border-slate-150 pb-5 mb-5 gap-3.5">
                  <View className="w-16 h-16 bg-slate-50 rounded-lg overflow-hidden justify-center items-center border border-slate-200 shadow-xs">
                    {selectedBreakdownProduct.image ? (
                      <ExpoImage 
                        source={{ uri: selectedBreakdownProduct.image }} 
                        style={{ width: '100%', height: '100%' }}
                        transition={200}
                      />
                    ) : (
                      <Package size={28} color="#94A3B8" />
                    )}
                  </View>
                  <View className="flex-1 justify-center">
                    <Text className="text-slate-900 font-black text-lg leading-tight" numberOfLines={2}>
                      {selectedBreakdownProduct.name}
                    </Text>
                    <View className="flex-row items-center gap-2.5 mt-1.5 flex-wrap">
                      <Text className="text-blue-600 font-black text-sm">
                        {formatCurrency(selectedBreakdownProduct.price)} / unit
                      </Text>
                      {selectedBreakdownProduct.stockQuantity !== null && (
                        <View className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                          <Text className="text-slate-700 font-extrabold text-xs">
                            In Stock: {selectedBreakdownProduct.stockQuantity}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Pressable 
                    onPress={() => setSelectedBreakdownProduct(null)}
                    className="bg-slate-100 p-2 rounded-md active:bg-slate-200"
                  >
                    <X size={18} color="#475569" />
                  </Pressable>
                </View>

                {/* Total Sell Analytics Showcase Card (Max 8px border radius) */}
                <View className="bg-slate-900 rounded-lg p-4 mb-6 shadow-sm flex-row justify-between items-center border border-slate-800">
                  <View className="flex-1 pr-2 border-r border-slate-800">
                    <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1" numberOfLines={1}>Sold Volume</Text>
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-emerald-400 font-black text-xl" numberOfLines={1} adjustsFontSizeToFit>
                        {selectedBreakdownProduct.totalQuantityAll || selectedBreakdownProduct.quantitySold || 0}
                      </Text>
                      <Text className="text-emerald-200 font-extrabold text-xs">Units</Text>
                    </View>
                  </View>
                  <View className="flex-1 pl-3">
                    <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1" numberOfLines={1}>Net Revenue</Text>
                    <Text className="text-white font-black text-lg" numberOfLines={1} adjustsFontSizeToFit>
                      {formatCurrency(selectedBreakdownProduct.revenueGenerated || 0)}
                    </Text>
                  </View>
                </View>

                {/* Status Breakdown Section */}
                <View className="mb-6">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Layers size={18} color="#3B82F6" />
                    <Text className="text-slate-800 font-black text-base">Order Status Breakdown</Text>
                  </View>

                  {(!selectedBreakdownProduct.statusBreakdown || Object.keys(selectedBreakdownProduct.statusBreakdown).length === 0) ? (
                    <View className="bg-slate-50 border border-slate-200 rounded-lg p-5 items-center">
                      <Text className="text-slate-600 font-bold text-xs text-center">
                        No orders recorded for this product during the selected timeframe ({rangeLabel}).
                      </Text>
                    </View>
                  ) : (
                    <View className="bg-white border border-slate-200/90 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {Object.entries(selectedBreakdownProduct.statusBreakdown || {}).sort((a: any, b: any) => (b[1]?.count || 0) - (a[1]?.count || 0)).map(([statusKey, val]: [string, any]) => {
                        let badgeColor = 'bg-blue-500';
                        let badgeTitle = statusKey.charAt(0).toUpperCase() + statusKey.slice(1);
                        if (statusKey === 'completed' || statusKey === 'complete') { badgeColor = 'bg-emerald-500'; badgeTitle = 'Completed Orders'; }
                        if (statusKey === 'processing') { badgeColor = 'bg-amber-500'; badgeTitle = 'Processing'; }
                        if (statusKey === 'cancelled' || statusKey === 'canceled') { badgeColor = 'bg-rose-500'; badgeTitle = 'Cancelled'; }
                        if (statusKey === 'on-hold' || statusKey === 'on_hold') { badgeColor = 'bg-blue-600'; badgeTitle = 'On-Hold'; }
                        if (statusKey === 'pending') { badgeColor = 'bg-purple-500'; badgeTitle = 'Pending Payment'; }

                        return (
                          <View key={statusKey} className="p-4 flex-row items-center justify-between bg-slate-50/50">
                            <View className="flex-row items-center gap-3">
                              <View className={`w-3 h-3 rounded-full ${badgeColor}`} />
                              <Text className="text-slate-800 font-bold text-sm">{badgeTitle}</Text>
                            </View>
                            <View className="items-end">
                              <Text className="text-slate-900 font-black text-base">{val.count} Units</Text>
                              <Text className="text-slate-500 text-xs font-semibold">{formatCurrency(val.revenue)}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Smart Bottom Actions (Max 8px border radius) */}
                <View className="flex-row gap-3 mt-2">
                  <Pressable
                    onPress={() => {
                      const pid = selectedBreakdownProduct.id;
                      setSelectedBreakdownProduct(null);
                      router.push(`/products/${pid}` as any);
                    }}
                    className="flex-1 bg-blue-600 h-12 rounded-lg items-center justify-center shadow-sm shadow-blue-500/30 active:bg-blue-700"
                  >
                    <Text className="text-white font-extrabold text-sm">Open Product Catalog</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedBreakdownProduct(null)}
                    className="bg-slate-100 px-6 h-12 rounded-lg items-center justify-center active:bg-slate-200 border border-slate-200/80"
                  >
                    <Text className="text-slate-700 font-extrabold text-sm">Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
