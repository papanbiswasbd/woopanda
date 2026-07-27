import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { sqlite } from '../../shared/database/db';
import { DollarSign, ShoppingBag, BarChart3, TrendingUp, Calendar, Trophy } from 'lucide-react-native';
import Svg, { Rect, Text as SvgText, Path } from 'react-native-svg';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';

const DATE_RANGES = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

export default function AnalyticsScreen() {
  const [selectedRange, setSelectedRange] = useState(7);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - selectedRange * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString();

      // 1. Calculate Core Metrics
      const metricsRow = sqlite.getAllSync<any>(
        `SELECT SUM(CAST(total AS REAL)) as netSales, COUNT(*) as count 
         FROM orders 
         WHERE date_created >= ? AND status != 'cancelled' AND status != 'failed'`,
        cutoffStr
      );
      const netSales = Number(metricsRow[0]?.netSales || 0);
      const orderCount = Number(metricsRow[0]?.count || 0);
      const averageOrderValue = orderCount > 0 ? netSales / orderCount : 0;

      // 2. Fetch all orders in range to aggregate top selling items in Javascript
      const ordersRes = sqlite.getAllSync<{ line_items: string }>(
        `SELECT line_items FROM orders WHERE date_created >= ? AND status != 'cancelled' AND status != 'failed'`,
        cutoffStr
      );
      
      const productSalesMap = new Map<number, { name: string; qty: number; sales: number }>();
      
      ordersRes.forEach((row) => {
        let lineItems: any[] = [];
        try {
          lineItems = row.line_items ? JSON.parse(row.line_items) : [];
        } catch {}
        
        lineItems.forEach((item: any) => {
          const pId = item.product_id || item.id;
          const existing = productSalesMap.get(pId) || { name: item.name, qty: 0, sales: 0 };
          existing.qty += item.quantity || 0;
          existing.sales += Number(item.total || 0);
          productSalesMap.set(pId, existing);
        });
      });

      // Sort map to get Top 5 Best Sellers
      const bestSellers = Array.from(productSalesMap.entries())
        .map(([id, info]) => ({ id, ...info }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      // 3. Compile Bar Chart Data (Group by date)
      const isLargeRange = selectedRange > 30;
      let chartQuery = '';
      
      if (isLargeRange) {
        chartQuery = `
          SELECT strftime('%W', date_created) as label, SUM(CAST(total AS REAL)) as total_val 
          FROM orders 
          WHERE date_created >= ? AND status != 'cancelled' AND status != 'failed'
          GROUP BY label 
          ORDER BY label ASC LIMIT 10`;
      } else {
        chartQuery = `
          SELECT date(date_created) as label, SUM(CAST(total AS REAL)) as total_val 
          FROM orders 
          WHERE date_created >= ? AND status != 'cancelled' AND status != 'failed'
          GROUP BY label 
          ORDER BY label ASC LIMIT 10`;
      }

      const chartRows = sqlite.getAllSync<any>(chartQuery, cutoffStr);
      
      const chartData = chartRows.map((row) => {
        let displayLabel = row.label || '';
        if (!isLargeRange && displayLabel) {
          const parts = displayLabel.split('-');
          if (parts.length === 3) displayLabel = `${parts[1]}/${parts[2]}`;
        } else if (isLargeRange) {
          displayLabel = `Wk ${displayLabel}`;
        }
        return {
          label: displayLabel,
          amount: Number(row.total_val || 0),
        };
      });

      // 4. Status distribution counts
      const statusRes = sqlite.getAllSync<{ status: string; count: number }>(
        `SELECT status, COUNT(*) as count FROM orders WHERE date_created >= ? GROUP BY status`,
        cutoffStr
      );
      
      const statusDistribution = statusRes.map((row) => ({
        status: row.status,
        count: Number(row.count || 0),
      }));

      setStats({
        netSales,
        orderCount,
        averageOrderValue,
        bestSellers,
        chartData,
        statusDistribution,
      });

    } catch (error) {
      console.error('Failed to compile analytics reports:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  const formatCurrency = (val: number) => {
    const storeCurrency = useSettingsStore.getState().currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: storeCurrency }).format(val);
    } catch {
      return `${getCurrencySymbol(storeCurrency)}${val.toFixed(2)}`;
    }
  };

  // Render SVG bars chart
  const renderBarChart = () => {
    if (!stats || stats.chartData.length === 0) {
      return (
        <View className="items-center py-8">
          <Text className="text-slate-500 text-xs">No transaction records found.</Text>
        </View>
      );
    }

    const data = stats.chartData;
    const maxVal = Math.max(...data.map((d: any) => d.amount), 50);

    const svgWidth = 320;
    const svgHeight = 150;
    const paddingLeft = 10;
    const paddingRight = 10;
    const paddingTop = 20;
    const paddingBottom = 20;

    const chartWidth = svgWidth - paddingLeft - paddingRight;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    const barWidth = Math.max(chartWidth / data.length - 8, 10);
    const gap = (chartWidth - barWidth * data.length) / (data.length - 1 || 1);

    return (
      <View className="items-center my-2">
        <Svg width={svgWidth} height={svgHeight}>
          {/* Horizontal Grid lines */}
          <Path d={`M ${paddingLeft} ${paddingTop} L ${svgWidth - paddingRight} ${paddingTop}`} stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" />
          <Path d={`M ${paddingLeft} ${svgHeight - paddingBottom} L ${svgWidth - paddingRight} ${svgHeight - paddingBottom}`} stroke="#475569" strokeWidth="1" />

          {/* Render Bars */}
          {data.map((d: any, idx: number) => {
            const x = paddingLeft + idx * (barWidth + gap);
            const valHeight = (d.amount / maxVal) * chartHeight;
            const y = svgHeight - paddingBottom - valHeight;

            return (
              <React.Fragment key={idx}>
                {/* Bar */}
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={valHeight}
                  fill="#3B82F6"
                  rx="3"
                />
                {/* Bar label text */}
                <SvgText
                  x={x + barWidth / 2}
                  y={svgHeight - 4}
                  fontSize="8"
                  fill="#94A3B8"
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
                {/* Top value */}
                {d.amount > 0 && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={y - 4}
                    fontSize="7"
                    fill="#3B82F6"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    ${Math.round(d.amount)}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. Date range filter pills */}
      <View className="flex-row bg-white border border-slate-200 p-1.5 rounded-2xl mb-5">
        {DATE_RANGES.map((range) => (
          <Pressable
            key={range.days}
            onPress={() => setSelectedRange(range.days)}
            className={`flex-1 py-2 rounded-xl items-center ${
              selectedRange === range.days ? 'bg-blue-600 shadow' : 'bg-transparent'
            }`}
          >
            <Text className={`text-xs font-bold ${
              selectedRange === range.days ? 'text-slate-900' : 'text-slate-600'
            }`}>
              {range.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 2. Core Metrics */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <Text className="text-slate-600 font-semibold text-xs uppercase mb-4 tracking-wider flex-row items-center gap-1.5">
          <Calendar size={12} className="mr-1.5" /> Performance Report
        </Text>

        <View className="gap-5">
          <View className="flex-row items-center gap-4">
            <View className="bg-emerald-500/10 p-3 rounded-2xl">
              <DollarSign size={22} color="#10B981" />
            </View>
            <View>
              <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Net Sales Revenue</Text>
              <Text className="text-slate-900 font-extrabold text-2xl mt-0.5">{formatCurrency(stats?.netSales)}</Text>
            </View>
          </View>

          <View className="flex-row items-center gap-4 border-t border-slate-200/80 pt-4">
            <View className="bg-blue-500/10 p-3 rounded-2xl">
              <ShoppingBag size={22} color="#3B82F6" />
            </View>
            <View>
              <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Successful Orders</Text>
              <Text className="text-slate-900 font-extrabold text-lg mt-0.5">{stats?.orderCount} checkouts</Text>
            </View>
          </View>

          <View className="flex-row items-center gap-4 border-t border-slate-200/80 pt-4">
            <View className="bg-amber-500/10 p-3 rounded-2xl">
              <TrendingUp size={22} color="#F59E0B" />
            </View>
            <View>
              <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Average Order Value</Text>
              <Text className="text-slate-900 font-extrabold text-lg mt-0.5">{formatCurrency(stats?.averageOrderValue)}</Text>
            </View>
          </View>
        </View>

      </View>

      {/* 3. Sales Histogram Chart */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-700 font-bold text-sm">Sales Chart</Text>
          <BarChart3 size={16} color="#64748B" />
        </View>
        {renderBarChart()}
      </View>

      {/* 4. Best Sellers Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5">
        <View className="flex-row items-center gap-2 mb-4">
          <Trophy size={18} color="#F59E0B" />
          <Text className="text-slate-700 font-bold text-sm">Best Selling Products</Text>
        </View>

        {stats?.bestSellers.length === 0 ? (
          <View className="items-center py-6">
            <Text className="text-slate-500 text-xs">No products sold in this period.</Text>
          </View>
        ) : (
          <View className="divide-y divide-slate-200">
            {stats?.bestSellers.map((item: any, idx: number) => (
              <View key={item.id} className="py-3 flex-row justify-between items-center">
                <View className="flex-1 pr-4 flex-row items-center gap-3">
                  <Text className="text-slate-500 font-bold text-sm w-4">{idx + 1}</Text>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-slate-500 text-[10px] mt-0.5">
                      Revenue: {formatCurrency(item.sales)}
                    </Text>
                  </View>
                </View>
                <View className="items-end bg-blue-500/10 px-2.5 py-1 rounded-lg">
                  <Text className="text-blue-400 font-bold text-xs">{item.qty} units</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 5. Order Pipeline analysis */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5">
        <Text className="text-slate-700 font-bold text-sm mb-4">Order Pipeline Volume</Text>
        
        {stats?.statusDistribution.length === 0 ? (
          <View className="items-center py-6">
            <Text className="text-slate-500 text-xs">No orders recorded.</Text>
          </View>
        ) : (
          <View className="gap-3">
            {stats?.statusDistribution.map((item: any) => (
              <View key={item.status} className="flex-row justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <Text className="text-slate-700 text-xs font-semibold uppercase">{item.status}</Text>
                <Text className="text-slate-900 font-extrabold text-xs">{item.count} orders</Text>
              </View>
            ))}
          </View>
        )}
      </View>

    </ScrollView>
  );
}
