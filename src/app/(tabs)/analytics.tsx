import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { sqlite } from '../../shared/database/db';
import { 
  BarChart3, TrendingUp, DollarSign, ShoppingBag, Users, 
  CreditCard, PieChart, ShieldAlert, Award, Tag, ArrowUpRight, CheckCircle2, Clock, AlertCircle
} from 'lucide-react-native';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';

interface AnalyticsData {
  timeLabel: string;
  grossRevenue: number;
  netRevenue: number;
  discountTotal: number;
  shippingTotal: number;
  totalOrders: number;
  aov: number;
  completedRevenue: number;
  pendingRevenue: number;
  failedRevenue: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  bestSellers: { id: number; name: string; qty: number; revenue: number; price: number }[];
  paymentMethods: { method: string; count: number; revenue: number }[];
  basketDistribution: { label: string; count: number; percent: number; color: string }[];
  customerStats: {
    totalCustomers: number;
    guestOrdersCount: number;
    registeredOrdersCount: number;
    avgSpendPerCustomer: number;
  };
  catalogStats: {
    totalProducts: number;
    outOfStockCount: number;
    activeCoupons: number;
    avgReviewRating: number;
    totalReviews: number;
  };
}

const RANGES = [
  { label: 'All Time', value: 'all' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'This Month', value: 'month' },
  { label: 'Year to Date', value: 'ytd' },
];

export default function StoreAnalyticsScreen() {
  const { currency } = useSettingsStore();
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const isComputing = useRef(false);

  const formatCurrency = (amount: number) => {
    try {
      const sym = getCurrencySymbol(currency);
      return `${sym}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } catch {
      return `${getCurrencySymbol(currency)}${(amount || 0).toFixed(2)}`;
    }
  };

  const loadAnalytics = useCallback(async () => {
    if (isComputing.current) return;
    isComputing.current = true;
    try {
      const now = new Date();
      let cutoffStr = '0000-00-00 00:00:00';
      let timeLabel = 'All Time Record';

      if (selectedRange === '7d') {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        cutoffStr = d.toISOString();
        timeLabel = 'Last 7 Days';
      } else if (selectedRange === '30d') {
        const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        cutoffStr = d.toISOString();
        timeLabel = 'Last 30 Days';
      } else if (selectedRange === 'month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        cutoffStr = d.toISOString();
        timeLabel = 'This Month';
      } else if (selectedRange === 'ytd') {
        const d = new Date(now.getFullYear(), 0, 1);
        cutoffStr = d.toISOString();
        timeLabel = 'Year to Date';
      }

      // 1. Fetch Orders for Financials & breakdowns
      const ordersRes = selectedRange === 'all'
        ? await sqlite.getAllAsync<any>(`SELECT total, discount_total, shipping_total, status, customer_id, line_items, payment_method_title FROM orders`)
        : await sqlite.getAllAsync<any>(`SELECT total, discount_total, shipping_total, status, customer_id, line_items, payment_method_title FROM orders WHERE date_created >= ?`, cutoffStr);

      let grossRevenue = 0;
      let netRevenue = 0;
      let discountTotal = 0;
      let shippingTotal = 0;
      let completedRevenue = 0;
      let pendingRevenue = 0;
      let failedRevenue = 0;
      let completedCount = 0;
      let pendingCount = 0;
      let failedCount = 0;
      let guestOrdersCount = 0;
      let registeredOrdersCount = 0;

      const productSalesMap = new Map<number, { name: string; qty: number; revenue: number }>();
      const paymentMap = new Map<string, { count: number; revenue: number }>();

      let basketUnder50 = 0;
      let basket50to150 = 0;
      let basket150to300 = 0;
      let basketOver300 = 0;

      ordersRes.forEach((o) => {
        const tot = Number(o.total || 0);
        const disc = Number(o.discount_total || 0);
        const ship = Number(o.shipping_total || 0);
        const status = (o.status || '').toLowerCase();
        const payTitle = o.payment_method_title || 'Other Method';
        const cid = Number(o.customer_id || 0);

        if (cid > 0) {
          registeredOrdersCount++;
        } else {
          guestOrdersCount++;
        }

        if (status === 'completed' || status === 'shipped' || status === 'delivering') {
          completedRevenue += tot;
          completedCount++;
          netRevenue += tot;
          discountTotal += disc;
          shippingTotal += ship;
        } else if (status === 'processing' || status === 'pending' || status === 'on-hold') {
          pendingRevenue += tot;
          pendingCount++;
          netRevenue += tot; // Included in pipeline turnover
          discountTotal += disc;
          shippingTotal += ship;
        } else {
          failedRevenue += tot;
          failedCount++;
        }

        // Aggregate Payment Methods for valid orders
        if (status !== 'cancelled' && status !== 'failed' && status !== 'refunded') {
          const pm = paymentMap.get(payTitle) || { count: 0, revenue: 0 };
          pm.count += 1;
          pm.revenue += tot;
          paymentMap.set(payTitle, pm);

          // Basket sizing
          if (tot < 50) basketUnder50++;
          else if (tot < 150) basket50to150++;
          else if (tot < 300) basket150to300++;
          else basketOver300++;

          // Product Sales Parsing
          if (o.line_items) {
            try {
              const items = JSON.parse(o.line_items);
              if (Array.isArray(items)) {
                items.forEach((it: any) => {
                  const pid = it.product_id || it.id;
                  if (!pid) return;
                  const iQty = Number(it.quantity) || 1;
                  const iTot = Number(it.total || it.subtotal || 0);
                  const ex = productSalesMap.get(pid) || { name: it.name || `Product #${pid}`, qty: 0, revenue: 0 };
                  ex.qty += iQty;
                  ex.revenue += iTot;
                  productSalesMap.set(pid, ex);
                });
              }
            } catch {}
          }
        }
      });

      grossRevenue = netRevenue + discountTotal;
      const totalValidOrders = completedCount + pendingCount;
      const aov = totalValidOrders > 0 ? netRevenue / totalValidOrders : 0;

      // Sort Best Sellers
      const bestSellers = Array.from(productSalesMap.entries())
        .map(([id, val]) => ({
          id,
          name: val.name,
          qty: val.qty,
          revenue: val.revenue,
          price: val.qty > 0 ? val.revenue / val.qty : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);

      // Payment Methods sorted by volume
      const paymentMethods = Array.from(paymentMap.entries())
        .map(([method, val]) => ({ method, count: val.count, revenue: val.revenue }))
        .sort((a, b) => b.revenue - a.revenue);

      // Basket Percentages
      const totBaskets = totalValidOrders || 1;
      const basketDistribution = [
        { label: 'Small Basket (< $50)', count: basketUnder50, percent: Math.round((basketUnder50 / totBaskets) * 100), color: 'bg-emerald-500' },
        { label: 'Medium Tier ($50 - $150)', count: basket50to150, percent: Math.round((basket50to150 / totBaskets) * 100), color: 'bg-blue-500' },
        { label: 'Large Order ($150 - $300)', count: basket150to300, percent: Math.round((basket150to300 / totBaskets) * 100), color: 'bg-purple-500' },
        { label: 'Wholesale / Enterprise (> $300)', count: basketOver300, percent: Math.round((basketOver300 / totBaskets) * 100), color: 'bg-amber-500' },
      ];

      // 2. Customer & Catalog KPIs
      const custRes = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM customers`);
      const totalCustomers = custRes[0]?.count || 0;
      const avgSpendPerCustomer = totalCustomers > 0 ? netRevenue / totalCustomers : 0;

      const prodRes = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM products`);
      const totalProducts = prodRes[0]?.count || 0;

      const oosRes = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM products WHERE manage_stock = 1 AND stock_quantity <= 0`);
      const outOfStockCount = oosRes[0]?.count || 0;

      const coupRes = await sqlite.getAllAsync<{ count: number }>(`SELECT COUNT(*) as count FROM coupons`);
      const activeCoupons = coupRes[0]?.count || 0;

      const revRes = await sqlite.getAllAsync<{ avgRate: number; count: number }>(`SELECT AVG(rating) as avgRate, COUNT(*) as count FROM reviews`);
      const avgReviewRating = Number(revRes[0]?.avgRate || 0);
      const totalReviews = Number(revRes[0]?.count || 0);

      setData({
        timeLabel,
        grossRevenue,
        netRevenue,
        discountTotal,
        shippingTotal,
        totalOrders: totalValidOrders,
        aov,
        completedRevenue,
        pendingRevenue,
        failedRevenue,
        completedCount,
        pendingCount,
        failedCount,
        bestSellers,
        paymentMethods,
        basketDistribution,
        customerStats: {
          totalCustomers,
          guestOrdersCount,
          registeredOrdersCount,
          avgSpendPerCustomer,
        },
        catalogStats: {
          totalProducts,
          outOfStockCount,
          activeCoupons,
          avgReviewRating,
          totalReviews,
        },
      });
    } catch (e) {
      console.error('Error compiling advanced store analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isComputing.current = false;
    }
  }, [selectedRange]);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  const handleExportDigest = () => {
    if (!data) return;
    const summary = `📈 WOOCOMMERCE ANALYTICS DIGEST (${data.timeLabel})\n\n` +
      `• Net Sales: ${formatCurrency(data.netRevenue)}\n` +
      `• Orders Volume: ${data.totalOrders} total\n` +
      `• Average Order Value: ${formatCurrency(data.aov)}\n` +
      `• Realized Profit: ${formatCurrency(data.completedRevenue)}\n` +
      `• In-Transit Cash: ${formatCurrency(data.pendingRevenue)}\n` +
      `• Registered Customers: ${data.customerStats.totalCustomers}\n` +
      `• Catalog Exposure: ${data.catalogStats.totalProducts} items (${data.catalogStats.outOfStockCount} out of stock)`;
    
    Alert.alert('Executive Digest Computed', summary, [{ text: 'Done', style: 'cancel' }]);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={['bottom']}>
      {/* Time Range Selector Bar */}
      <View className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm shadow-slate-100">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {RANGES.map((r) => {
            const active = selectedRange === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => setSelectedRange(r.value)}
                className={`px-4 py-2 rounded-lg border flex-row items-center justify-center ${
                  active 
                    ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-500/30' 
                    : 'bg-slate-50 border-slate-200/80 active:bg-slate-200/60'
                }`}
              >
                <Text className={`text-xs font-black ${active ? 'text-white' : 'text-slate-700'}`}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView 
        className="flex-1 px-4 pt-4" 
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />}
      >
        {loading || !data ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-slate-500 font-bold text-xs mt-3 uppercase tracking-wider">Compiling Store Intelligence...</Text>
          </View>
        ) : (
          <View className="gap-5">
            {/* 1. Executive Revenue Matrix Hero Card */}
            <View className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-lg shadow-slate-900/30">
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Store Net Turnover ({data.timeLabel})</Text>
                  <Text className="text-3xl font-black text-white mt-1">{formatCurrency(data.netRevenue)}</Text>
                </View>
                <View className="bg-blue-500/20 p-3 rounded-lg border border-blue-500/30">
                  <BarChart3 size={24} color="#3B82F6" />
                </View>
              </View>

              <View className="flex-row border-t border-slate-800 pt-4 mb-4">
                <View className="flex-1 border-r border-slate-800 pr-3">
                  <Text className="text-slate-400 text-[11px] font-bold">Gross Revenue</Text>
                  <Text className="text-emerald-400 font-black text-base mt-0.5">{formatCurrency(data.grossRevenue)}</Text>
                </View>
                <View className="flex-1 border-r border-slate-800 px-3">
                  <Text className="text-slate-400 text-[11px] font-bold">Total Orders</Text>
                  <Text className="text-white font-black text-base mt-0.5">{data.totalOrders}</Text>
                </View>
                <View className="flex-1 pl-3">
                  <Text className="text-slate-400 text-[11px] font-bold">Avg Order Value</Text>
                  <Text className="text-white font-black text-base mt-0.5">{formatCurrency(data.aov)}</Text>
                </View>
              </View>

              <View className="flex-row justify-between bg-slate-800/80 p-3 rounded-lg">
                <View className="flex-row items-center gap-2">
                  <Tag size={14} color="#F59E0B" />
                  <Text className="text-slate-300 text-xs font-semibold">Discounts: <Text className="text-amber-400 font-extrabold">{formatCurrency(data.discountTotal)}</Text></Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-slate-300 text-xs font-semibold">Shipping: <Text className="text-blue-400 font-extrabold">{formatCurrency(data.shippingTotal)}</Text></Text>
                </View>
              </View>
            </View>

            {/* 2. Cash Realization & Pipeline Analysis */}
            <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="bg-emerald-500/10 p-2 rounded-lg">
                    <PieChart size={16} color="#10B981" />
                  </View>
                  <Text className="text-slate-900 font-black text-sm uppercase tracking-wider">Cash Flow Breakdown</Text>
                </View>
                <Text className="text-slate-500 font-bold text-xs">Real-Time Risk</Text>
              </View>

              <View className="gap-3.5">
                <View>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <View className="flex-row items-center gap-2">
                      <CheckCircle2 size={15} color="#10B981" />
                      <Text className="text-slate-800 font-extrabold text-xs">Realized Revenue (Completed)</Text>
                    </View>
                    <Text className="text-slate-900 font-black text-xs">{formatCurrency(data.completedRevenue)} ({data.completedCount})</Text>
                  </View>
                  <View className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                    <View 
                      className="h-full bg-emerald-500 rounded" 
                      style={{ width: `${Math.min(100, Math.max(5, (data.completedRevenue / (data.netRevenue || 1)) * 100))}%` }} 
                    />
                  </View>
                </View>

                <View>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <View className="flex-row items-center gap-2">
                      <Clock size={15} color="#3B82F6" />
                      <Text className="text-slate-800 font-extrabold text-xs">In-Transit Cash (Processing/Pending)</Text>
                    </View>
                    <Text className="text-slate-900 font-black text-xs">{formatCurrency(data.pendingRevenue)} ({data.pendingCount})</Text>
                  </View>
                  <View className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                    <View 
                      className="h-full bg-blue-500 rounded" 
                      style={{ width: `${Math.min(100, Math.max(5, (data.pendingRevenue / (data.netRevenue || 1)) * 100))}%` }} 
                    />
                  </View>
                </View>

                {data.failedCount > 0 && (
                  <View>
                    <View className="flex-row justify-between items-center mb-1.5">
                      <View className="flex-row items-center gap-2">
                        <AlertCircle size={15} color="#EF4444" />
                        <Text className="text-red-700 font-extrabold text-xs">At-Risk / Lost Revenue (Cancelled)</Text>
                      </View>
                      <Text className="text-red-700 font-black text-xs">{formatCurrency(data.failedRevenue)} ({data.failedCount})</Text>
                    </View>
                    <View className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                      <View className="h-full bg-red-500 rounded" style={{ width: '25%' }} />
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* 3. Merchandising & Best Sellers Leaderboard */}
            <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="bg-blue-500/10 p-2 rounded-lg">
                    <Award size={16} color="#3B82F6" />
                  </View>
                  <Text className="text-slate-900 font-black text-sm uppercase tracking-wider">Top Selling Intelligence</Text>
                </View>
                <Text className="text-blue-600 font-extrabold text-xs">By Revenue</Text>
              </View>

              {data.bestSellers.length === 0 ? (
                <View className="py-6 items-center">
                  <ShoppingBag size={28} color="#94A3B8" />
                  <Text className="text-slate-500 font-semibold text-xs mt-2">No product items recorded in this timeframe.</Text>
                </View>
              ) : (
                <View className="divide-y divide-slate-100">
                  {data.bestSellers.map((prod, idx) => (
                    <View key={idx} className="py-3 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3 flex-1 pr-4">
                        <View className="w-7 h-7 bg-slate-100 border border-slate-200 rounded-lg items-center justify-center">
                          <Text className="text-slate-700 font-black text-xs">#{idx + 1}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-slate-900 font-extrabold text-sm" numberOfLines={1}>{prod.name}</Text>
                          <Text className="text-slate-500 font-bold text-xs mt-0.5">{prod.qty} units sold • Avg {formatCurrency(prod.price)}/ea</Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-emerald-700 font-black text-sm">{formatCurrency(prod.revenue)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* 4. Customer Behavior & Loyalty Intelligence */}
            <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="bg-purple-500/10 p-2 rounded-lg">
                    <Users size={16} color="#A855F7" />
                  </View>
                  <Text className="text-slate-900 font-black text-sm uppercase tracking-wider">Customer Intelligence</Text>
                </View>
                <Text className="text-slate-500 font-bold text-xs">{data.customerStats.totalCustomers} Profiles</Text>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1 bg-slate-50 border border-slate-200/80 p-3.5 rounded-lg">
                  <Text className="text-slate-500 text-[11px] font-bold uppercase">Registered vs Guest</Text>
                  <Text className="text-slate-900 font-black text-lg mt-1">{data.customerStats.registeredOrdersCount} <Text className="text-slate-400 text-sm">/ {data.customerStats.guestOrdersCount} guests</Text></Text>
                  <Text className="text-slate-600 text-xs font-semibold mt-1">Orders from account profiles</Text>
                </View>
                <View className="flex-1 bg-slate-50 border border-slate-200/80 p-3.5 rounded-lg">
                  <Text className="text-slate-500 text-[11px] font-bold uppercase">Customer LTV Value</Text>
                  <Text className="text-purple-700 font-black text-lg mt-1">{formatCurrency(data.customerStats.avgSpendPerCustomer)}</Text>
                  <Text className="text-slate-600 text-xs font-semibold mt-1">Average lifetime turnover</Text>
                </View>
              </View>
            </View>

            {/* 5. Basket Size Segmentation */}
            <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <View className="bg-amber-500/10 p-2 rounded-lg">
                    <TrendingUp size={16} color="#F59E0B" />
                  </View>
                  <Text className="text-slate-900 font-black text-sm uppercase tracking-wider">Order Size Segmentation</Text>
                </View>
                <Text className="text-slate-500 font-bold text-xs">{data.totalOrders} Baskets</Text>
              </View>

              <View className="gap-3">
                {data.basketDistribution.map((tier, index) => (
                  <View key={index}>
                    <View className="flex-row justify-between items-center mb-1">
                      <Text className="text-slate-800 font-bold text-xs">{tier.label}</Text>
                      <Text className="text-slate-900 font-extrabold text-xs">{tier.count} orders ({tier.percent}%)</Text>
                    </View>
                    <View className="w-full h-1.5 bg-slate-100 rounded overflow-hidden">
                      <View className={`h-full ${tier.color} rounded`} style={{ width: `${Math.max(3, tier.percent)}%` }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* 6. Payment Method Gateways */}
            {data.paymentMethods.length > 0 && (
              <View className="bg-white border border-slate-200/90 rounded-lg p-5 shadow-sm shadow-slate-100">
                <View className="flex-row items-center gap-2 mb-4">
                  <View className="bg-cyan-500/10 p-2 rounded-lg">
                    <CreditCard size={16} color="#06B6D4" />
                  </View>
                  <Text className="text-slate-900 font-black text-sm uppercase tracking-wider">Payment Method Volume</Text>
                </View>

                <View className="divide-y divide-slate-100">
                  {data.paymentMethods.map((pm, idx) => (
                    <View key={idx} className="py-2.5 flex-row justify-between items-center">
                      <Text className="text-slate-800 font-bold text-xs flex-1 pr-3">{pm.method}</Text>
                      <View className="items-end">
                        <Text className="text-slate-900 font-black text-sm">{formatCurrency(pm.revenue)}</Text>
                        <Text className="text-slate-400 font-semibold text-[10px]">{pm.count} transactions</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 7. Catalog & Inventory Exposure Alert */}
            <View className="bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-md shadow-slate-900/20">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <ShieldAlert size={18} color="#F59E0B" />
                  <Text className="text-white font-black text-sm uppercase tracking-wider">Catalog Health Exposure</Text>
                </View>
              </View>

              <View className="flex-row justify-between items-center border-t border-slate-800/80 pt-3">
                <View className="items-center flex-1 border-r border-slate-800">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase">Total SKUs</Text>
                  <Text className="text-white font-black text-base mt-0.5">{data.catalogStats.totalProducts}</Text>
                </View>
                <View className="items-center flex-1 border-r border-slate-800">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase">Out of Stock</Text>
                  <Text className={`font-black text-base mt-0.5 ${data.catalogStats.outOfStockCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {data.catalogStats.outOfStockCount} items
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase">Avg Review</Text>
                  <Text className="text-amber-400 font-black text-base mt-0.5">★ {data.catalogStats.avgReviewRating.toFixed(1)}</Text>
                </View>
              </View>
            </View>

            {/* Executive Digest Button */}
            <Pressable
              onPress={handleExportDigest}
              className="bg-blue-600 h-12 rounded-lg items-center justify-center flex-row gap-2 shadow-sm shadow-blue-500/20 active:bg-blue-700"
            >
              <Text className="text-white font-extrabold text-sm">Generate Executive Analytics Digest</Text>
              <ArrowUpRight size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
