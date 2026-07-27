import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Modal, useColorScheme, Animated, Easing, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useNavigation } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { 
  TrendingUp, ShoppingBag, AlertTriangle, ChevronRight, 
  ArrowUpRight, DollarSign, Clock, CheckCircle2, XCircle, RefreshCw, AlertCircle, Calendar
} from 'lucide-react-native';
import Svg, { Path, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';

interface DashboardStats {
  revenueTotal: number;
  ordersCount: number;
  averageOrderValue: number;
  pendingOrdersCount: number;
  processingOrdersCount: number;
  onHoldOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  refundedOrdersCount: number;
  failedOrdersCount: number;
  lowStockCount: number;
  recentOrders: any[];
  weeklyChartData: { day: string; amount: number }[];
}

const FILTER_OPTIONS = [
  { label: 'All Data (Default)', value: 'all_data' },
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
  const scheme = useColorScheme();
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filter States
  const [selectedRange, setSelectedRange] = useState<string>('all_data');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  
  // Modals Visibility
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);

  // Calendar State
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  const spinValue = useRef(new Animated.Value(0)).current;

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

  // Calculate Date Ranges
  const getRangeDetails = () => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = 'This Month';
    let groupType: 'hour' | 'day' | 'month' = 'day';

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
        label = 'Custom';
        
        const diffDays = Math.ceil(Math.abs((customEnd?.getTime() || 0) - (customStart?.getTime() || 0)) / (1000 * 60 * 60 * 24));
        groupType = diffDays > 60 ? 'month' : 'day';
        break;
    }

    if (selectedRange !== 'last_month' && selectedRange !== 'last_year' && selectedRange !== 'custom') {
      end = new Date();
    }

    if (selectedRange !== 'today' && selectedRange !== 'custom') {
      start.setHours(0, 0, 0, 0);
    }
    
    return {
      startStr: start.toISOString(),
      endStr: end.toISOString(),
      label,
      groupType,
    };
  };

  const isLoadingData = useRef(false);

  // Compile statistics locally from SQLite DB
  const loadDashboardData = useCallback(async () => {
    if (isLoadingData.current) return;
    isLoadingData.current = true;
    try {
      const { startStr, endStr, groupType } = getRangeDetails();

      // 1. Calculate revenues
      const revTotal = await sqlite.getAllAsync<{ sum: number | null }>(
        `SELECT SUM(CAST(total AS REAL)) as sum FROM orders WHERE date_created >= ? AND date_created <= ? AND status != 'cancelled' AND status != 'failed'`,
        startStr, endStr
      );
      const revenueTotal = revTotal[0]?.sum || 0;

      // 2. Count orders
      const ordTotal = await sqlite.getAllAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM orders WHERE date_created >= ? AND date_created <= ?`,
        startStr, endStr
      );
      const ordersCount = ordTotal[0]?.count || 0;

      // 3. Average Order Value
      const averageOrderValue = ordersCount > 0 ? (revenueTotal / ordersCount) : 0;

      // 4. Count statuses
      const pendingOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const processingOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'processing' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const onHoldOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'on-hold' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const completedOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'completed' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const cancelledOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const refundedOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'refunded' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;
      const failedOrdersCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM orders WHERE status = 'failed' AND date_created >= ? AND date_created <= ?`, startStr, endStr))[0]?.count || 0;

      // 5. Low stock products
      const lowStockCount = (await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM products WHERE manage_stock = 1 AND stock_quantity <= 5`))[0]?.count || 0;

      // 6. Recent orders
      let recentOrdersRows = await sqlite.getAllAsync<{ id: number; number: string; total: string; status: string; date_created: string; billing: string }>(
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

      // 7. Chart compilation
      const chartRows = await sqlite.getAllAsync<{ label: string; total_sum: number | null }>(
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
        ordersCount,
        averageOrderValue,
        pendingOrdersCount,
        processingOrdersCount,
        onHoldOrdersCount,
        completedOrdersCount,
        cancelledOrdersCount,
        refundedOrdersCount,
        failedOrdersCount,
        lowStockCount,
        recentOrders,
        weeklyChartData,
      });

    } catch (error) {
      console.error('Failed to compile dashboard metrics:', error);
    } finally {
      isLoadingData.current = false;
      setLoading(false);
    }
  }, [selectedRange, customStart, customEnd]);

  // Sync data automatically in the background on mount and set up real-time polling
  useEffect(() => {
    async function initialSync() {
      await syncService.syncAll();
      loadDashboardData();
    }
    initialSync();

    // Poll SQLite database records every 3 seconds to keep counters dynamic
    const interval = setInterval(loadDashboardData, 3000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  // Reload data when tabs gain focus
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
    console.log('Triggering manual synchronization...');
    try {
      await syncService.syncAll();
      loadDashboardData();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Configure Header filters dynamically
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-2 mr-4">
          <Pressable 
            onPress={() => setFilterModalVisible(true)}
            className="w-9 h-9 bg-slate-100 border border-slate-200 rounded items-center justify-center active:bg-slate-200"
          >
            <Calendar size={16} color="#475569" />
          </Pressable>
          
          <Pressable 
            onPress={triggerManualSync}
            disabled={syncing}
            className="w-9 h-9 bg-slate-100 border border-slate-200 rounded items-center justify-center active:bg-slate-200"
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={15} color="#3B82F6" />
            </Animated.View>
          </Pressable>
        </View>
      )
    });
  }, [selectedRange, customStart, customEnd, syncing]);

  // Custom calendar date press resolver
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
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: storeCurrency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${getCurrencySymbol(storeCurrency)}${amount.toFixed(2)}`;
    }
  };

  // SVG Chart rendering calculations
  const renderWeeklyChart = () => {
    if (!stats || stats.weeklyChartData.length === 0) return null;

    const data = stats.weeklyChartData;
    const maxVal = Math.max(...data.map((d) => d.amount), 50);

    const chartWidth = 320;
    const chartHeight = 160;
    const padding = 20;

    const graphWidth = chartWidth - padding * 2;
    const graphHeight = chartHeight - padding * 2;

    const points = data.map((d, index) => {
      const x = padding + (index / (data.length - 1)) * graphWidth;
      const y = chartHeight - padding - (d.amount / maxVal) * graphHeight;
      return { x, y, amount: d.amount, day: d.day };
    });

    let pathD = '';
    points.forEach((p, idx) => {
      if (idx === 0) {
        pathD = `M ${p.x} ${p.y}`;
      } else {
        pathD += ` L ${p.x} ${p.y}`;
      }
    });

    return (
      <View className="items-center mt-3">
        <Svg width={chartWidth} height={chartHeight}>
          {/* Horizontal Grid guidelines */}
          <Path d={`M ${padding} ${padding} L ${chartWidth - padding} ${padding}`} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
          <Path d={`M ${padding} ${chartHeight / 2} L ${chartWidth - padding} ${chartHeight / 2}`} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
          <Path d={`M ${padding} ${chartHeight - padding} L ${chartWidth - padding} ${chartHeight - padding}`} stroke="#CBD5E1" strokeWidth="1" />

          {/* Under Area Gradient Shading */}
          {points.length > 0 && (
            <Path
              d={`${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`}
              fill="rgba(59, 130, 246, 0.08)"
            />
          )}

          {/* Spline Path */}
          <Path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2.5" />

          {/* Graph Nodes */}
          {points.map((p, idx) => (
            <Circle key={`c-${idx}`} cx={p.x} cy={p.y} r="3.5" fill="#FFFFFF" stroke="#3B82F6" strokeWidth="2" />
          ))}

          {/* Labels & values rendering */}
          {points.map((p, idx) => {
            const shouldRenderText = idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1;
            if (!shouldRenderText) return null;

            return (
              <SvgText
                key={`lbl-${idx}`}
                x={p.x}
                y={chartHeight - 4}
                fontSize="8"
                fontWeight="600"
                fill="#64748B"
                textAnchor="middle"
              >
                {p.day}
              </SvgText>
            );
          })}

          {points.map((p, idx) => {
            const shouldRenderText = idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1;
            if (!shouldRenderText || p.amount === 0) return null;

            return (
              <SvgText
                key={`val-${idx}`}
                x={p.x}
                y={p.y - 8}
                fontSize="8"
                fontWeight="bold"
                fill="#2563EB"
                textAnchor="middle"
              >
                {Math.round(p.amount)}
              </SvgText>
            );
          })}
        </Svg>
      </View>
    );
  };

  const renderCalendar = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 is Sunday
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const days = [];
    // Previous month empty slots
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(<View key={`empty-${i}`} className="w-9 h-9" />);
    }

    // Days of current month
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
        <Pressable
          key={`day-${d}`}
          onPress={() => handleDatePress(currentDay)}
          className={cellClass}
        >
          <Text className={textClass}>{d}</Text>
        </Pressable>
      );
    }

    return (
      <View className="bg-white border border-slate-200 rounded p-4 shadow-lg w-72">
        {/* Month selector */}
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
            className="p-1.5 active:bg-slate-100 rounded"
          >
            <ChevronRight size={16} className="rotate-180" color="#475569" />
          </Pressable>
          <Text className="text-slate-800 font-bold text-sm">
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
            className="p-1.5 active:bg-slate-100 rounded"
          >
            <ChevronRight size={16} color="#475569" />
          </Pressable>
        </View>

        {/* Weekday headers */}
        <View className="flex-row justify-between border-b border-slate-100 pb-1.5">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
            <Text key={day} className="w-9 text-center text-slate-400 text-[10px] font-bold">
              {day}
            </Text>
          ))}
        </View>

        {/* Days grid */}
        <View className="flex-row flex-wrap mt-1">
          {days}
        </View>

        {/* Range status details */}
        <View className="mt-4 border-t border-slate-100 pt-3">
          <Text className="text-slate-500 text-[10px] font-medium leading-normal">
            Start: {customStart ? customStart.toLocaleDateString() : 'Not selected'}{'\n'}
            End: {customEnd ? customEnd.toLocaleDateString() : 'Not selected'}
          </Text>
          
          <View className="flex-row gap-2 mt-4">
            <Pressable
              onPress={() => {
                setCustomStart(null);
                setCustomEnd(null);
              }}
              className="flex-1 bg-slate-100 h-9 rounded items-center justify-center active:bg-slate-200"
            >
              <Text className="text-slate-600 font-bold text-xs">Clear</Text>
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
              className="flex-1 bg-blue-600 h-9 rounded items-center justify-center active:bg-blue-700"
            >
              <Text className="text-white font-bold text-xs">Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const statusCarouselData = [
    { label: 'Pending', value: 'pending', count: stats?.pendingOrdersCount || 0, dotClass: 'bg-amber-500' },
    { label: 'Processing', value: 'processing', count: stats?.processingOrdersCount || 0, dotClass: 'bg-blue-500' },
    { label: 'On Hold', value: 'on-hold', count: stats?.onHoldOrdersCount || 0, dotClass: 'bg-orange-500' },
    { label: 'Completed', value: 'completed', count: stats?.completedOrdersCount || 0, dotClass: 'bg-emerald-500' },
    { label: 'Cancelled', value: 'cancelled', count: stats?.cancelledOrdersCount || 0, dotClass: 'bg-red-500' },
    { label: 'Refunded', value: 'refunded', count: stats?.refundedOrdersCount || 0, dotClass: 'bg-purple-500' },
    { label: 'Failed', value: 'failed', count: stats?.failedOrdersCount || 0, dotClass: 'bg-rose-500' },
  ];

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-slate-600 mt-3 font-medium">Preparing Analytics...</Text>
      </View>
    );
  }

  const rangeLabel = getRangeDetails().label;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
      <ScrollView 
        className="flex-grow bg-slate-50" 
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
        }
      >
        
        {/* Dynamic Status Carousel */}
        <View className="pt-5 mb-1 bg-slate-50">
          <Text className="text-slate-700 font-bold text-sm pl-4 mb-3">Order status</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 16 }}
          >
            {statusCarouselData.map((item, idx) => {
              return (
                <Pressable
                  key={item.label}
                  onPress={() => router.replace({ pathname: '/(tabs)/orders', params: { filter: item.value } })}
                  className={`bg-white border border-slate-200 rounded p-3 w-28 h-24 items-center justify-center active:opacity-75 ${
                    idx > 0 ? 'ml-2.5' : ''
                  }`}
                >
                  <Text className="text-slate-800 font-extrabold text-2xl leading-none">{item.count}</Text>
                  <Text className="text-slate-400 text-[11px] font-bold mt-1 text-center">{item.label}</Text>
                  <View className={`w-7 h-1.5 rounded-full mt-2.5 ${item.dotClass}`} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View className="px-5 pt-3">

          {/* 1. Header Overview Cards */}
          <View className="bg-white border border-slate-200 rounded p-5 mb-5">
            <View className="flex-row justify-between items-center mb-4">
              <View>
                <Text className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Total Revenue ({rangeLabel})</Text>
                <Text className="text-3xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(stats?.revenueTotal || 0)}
                </Text>
              </View>
              <View className="bg-blue-500/10 p-3 rounded">
                <TrendingUp size={24} color="#3B82F6" />
              </View>
            </View>
            
            <View className="flex-row justify-between border-t border-slate-200 pt-4">
              <View>
                <Text className="text-slate-500 text-xs font-semibold">Orders Count</Text>
                <Text className="text-slate-800 font-bold text-base mt-0.5">
                  {stats?.ordersCount}
                </Text>
              </View>
              <View>
                <Text className="text-slate-500 text-xs font-semibold text-right">Average Value</Text>
                <Text className="text-slate-800 font-bold text-base mt-0.5 text-right">
                  {formatCurrency(stats?.averageOrderValue || 0)}
                </Text>
              </View>
            </View>
          </View>

          {/* 2. Operations Grid */}
          <View className="flex-row gap-4 mb-5">
            {/* Orders Today Card */}
            <View className="flex-1 bg-white border border-slate-200 p-4 rounded flex-row items-center gap-3">
              <View className="bg-emerald-500/10 p-2.5 rounded">
                <ShoppingBag size={20} color="#10B981" />
              </View>
              <View>
                <Text className="text-slate-600 text-xs font-medium">Low Stock</Text>
                <Text className="text-slate-900 font-extrabold text-lg mt-0.5">{stats?.lowStockCount}</Text>
              </View>
            </View>

            {/* Low Stock Card */}
            <Pressable 
              onPress={() => router.push('/inventory/index')}
              className="flex-1 bg-white border border-slate-200 p-4 rounded flex-row items-center gap-3 active:bg-slate-150"
            >
              <View className="bg-amber-500/10 p-2.5 rounded">
                <AlertTriangle size={20} color="#F59E0B" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-600 text-xs font-medium">App Settings</Text>
                <Text className="text-slate-900 font-extrabold text-xs mt-1">Configure</Text>
              </View>
              <ChevronRight size={16} color="#64748B" />
            </Pressable>
          </View>

          {/* 3. Revenue Trend Chart */}
          <View className="bg-white border border-slate-200 rounded p-5 mb-5">
            <Text className="text-slate-700 font-bold text-sm mb-4">Revenue Trend ({rangeLabel})</Text>
            {renderWeeklyChart()}
          </View>

          {/* 4. Recent Orders */}
          <View className="bg-white border border-slate-200 rounded p-5">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-slate-700 font-bold text-sm">Recent Orders ({rangeLabel})</Text>
              <Pressable onPress={() => router.push('/(tabs)/orders')}>
                <Text className="text-blue-500 font-bold text-xs">View All</Text>
              </Pressable>
            </View>

            {stats?.recentOrders.length === 0 ? (
              <View className="items-center py-6">
                <Text className="text-slate-500 text-xs">No orders found in this range.</Text>
              </View>
            ) : (
              <View className="divide-y divide-slate-200">
                {stats?.recentOrders.map((order, idx) => (
                  <Pressable 
                    key={order.id}
                    onPress={() => router.push(`/orders/${order.id}`)}
                    className={`flex-row justify-between items-center py-3.5 ${idx === 0 ? 'pt-0' : ''} ${idx === stats.recentOrders.length - 1 ? 'pb-0' : ''} active:opacity-70`}
                  >
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-slate-900 font-bold text-sm">#{order.number}</Text>
                        <View className={`px-2 py-0.5 rounded ${
                          order.status === 'processing' ? 'bg-blue-500/10' :
                          order.status === 'completed' ? 'bg-emerald-500/10' :
                          order.status === 'pending' ? 'bg-amber-500/10' : 'bg-slate-100'
                        }`}>
                          <Text className={`text-[10px] font-extrabold uppercase ${
                            order.status === 'processing' ? 'text-blue-400' :
                            order.status === 'completed' ? 'text-emerald-400' :
                            order.status === 'pending' ? 'text-amber-400' : 'text-slate-600'
                          }`}>
                            {order.status}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-slate-600 text-xs mt-1" numberOfLines={1}>
                        {order.billing?.first_name} {order.billing?.last_name || 'Guest Customer'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-slate-900 font-bold text-sm">{formatCurrency(Number(order.total))}</Text>
                      <Text className="text-slate-500 text-[10px] mt-1">
                        {(() => {
                          if (!order.dateCreated) return 'Unknown';
                          try {
                            const normalized = order.dateCreated.replace(' ', 'T');
                            const parsedDate = new Date(normalized);
                            return isNaN(parsedDate.getTime()) 
                              ? order.dateCreated.split(' ')[0] 
                              : parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
          <View className="bg-white border-t border-slate-200 rounded-t p-6">
            <Text className="text-slate-900 font-bold text-base mb-4 text-center">Filter Dashboard Data</Text>
            
            <View className="gap-2.5">
              {FILTER_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    if (opt.value === 'custom') {
                      setCalendarModalVisible(true);
                    } else {
                      setSelectedRange(opt.value);
                      setFilterModalVisible(false);
                    }
                  }}
                  className={`h-11 rounded items-center justify-center border ${
                    selectedRange === opt.value 
                      ? 'bg-blue-500/10 border-blue-500' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${
                    selectedRange === opt.value ? 'text-blue-600' : 'text-slate-600'
                  }`}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setFilterModalVisible(false)}
              className="bg-slate-100 h-11 rounded items-center justify-center mt-5 active:bg-slate-200"
            >
              <Text className="text-slate-600 font-bold text-sm">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Custom pure-JS Range Calendar Picker Modal */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-slate-900/40 px-6">
          {renderCalendar()}
        </View>
      </Modal>

    </SafeAreaView>
  );
}
