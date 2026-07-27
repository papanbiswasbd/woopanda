import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Image, Alert } from 'react-native';
import { db, sqlite } from '../../shared/database/db';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { AlertCircle, ShoppingBag, Plus, Minus, Check, RefreshCw } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';

export default function InventoryScreen() {
  const [filterType, setFilterType] = useState<'low' | 'out'>('low');
  const [loading, setLoading] = useState(true);
  const [stockItems, setStockItems] = useState<any[]>([]);

  // Query database for matching stock issues
  const loadStockData = useCallback(() => {
    try {
      let rows: any[] = [];
      if (filterType === 'low') {
        rows = sqlite.getAllSync<any>(
          `SELECT id, name, stock_quantity as stockQuantity, sku, images, stock_status as stockStatus 
           FROM products 
           WHERE manage_stock = 1 AND stock_quantity <= 5 AND stock_quantity > 0
           ORDER BY stock_quantity ASC`
        );
      } else {
        rows = sqlite.getAllSync<any>(
          `SELECT id, name, stock_quantity as stockQuantity, sku, images, stock_status as stockStatus 
           FROM products 
           WHERE stock_status = "outofstock" OR (manage_stock = 1 AND stock_quantity <= 0)
           ORDER BY name ASC`
        );
      }

      const parsed = rows.map((r: any) => {
        let imgs = [];
        try {
          imgs = r.images ? JSON.parse(r.images) : [];
        } catch {}
        return {
          id: r.id,
          name: r.name,
          stockQuantity: r.stockQuantity,
          sku: r.sku,
          images: imgs,
          stockStatus: r.stockStatus,
        };
      });

      setStockItems(parsed);
    } catch (err) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    loadStockData();
  }, [filterType, loadStockData]);

  // Adjust stock level (Optimistic + Offline Queue)
  const adjustStock = async (item: any, delta: number) => {
    const currentQty = item.stockQuantity !== null ? item.stockQuantity : 0;
    const nextQty = Math.max(0, currentQty + delta);
    const nextStatus = nextQty === 0 ? 'outofstock' : 'instock';

    try {
      // 1. Optimistic database write
      sqlite.runSync(
        `UPDATE products SET stock_quantity = ?, stock_status = ?, last_updated = ? WHERE id = ?`,
        nextQty, nextStatus, Date.now(), item.id
      );

      // 2. Queue mutation upload task
      await syncQueueService.enqueue('UPDATE_PRODUCT', {
        id: item.id,
        manage_stock: true,
        stock_quantity: nextQty,
      });

      // Update UI list immediately
      setStockItems(prev => prev.map(p => {
        if (p.id === item.id) {
          return {
            ...p,
            stockQuantity: nextQty,
            stockStatus: nextStatus,
          };
        }
        return p;
      }));

      // Flush sync queue
      syncQueueService.processQueue().catch(() => {});

    } catch (error) {
      console.error('Failed to update stock quantity:', error);
      Alert.alert('Error', 'Failed to adjust stock level.');
    }
  };

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-4">
      
      {/* Filters bar */}
      <View className="flex-row bg-white border border-slate-200 p-1.5 rounded-2xl mb-5">
        <Pressable
          onPress={() => setFilterType('low')}
          className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
            filterType === 'low' ? 'bg-blue-600 shadow' : 'bg-transparent'
          }`}
        >
          <AlertCircle size={14} color={filterType === 'low' ? '#FFFFFF' : '#94A3B8'} />
          <Text className={`text-xs font-bold ${
            filterType === 'low' ? 'text-slate-900' : 'text-slate-600'
          }`}>
            Low Stock Alerts
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFilterType('out')}
          className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
            filterType === 'out' ? 'bg-blue-600 shadow' : 'bg-transparent'
          }`}
        >
          <ShoppingBag size={14} color={filterType === 'out' ? '#FFFFFF' : '#94A3B8'} />
          <Text className={`text-xs font-bold ${
            filterType === 'out' ? 'text-slate-900' : 'text-slate-600'
          }`}>
            Out of Stock
          </Text>
        </Pressable>
      </View>

      {/* Main Stock List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : stockItems.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <AlertCircle size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">All stock levels stable</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-8">
            No products currently match your stock filters. Good job!
          </Text>
        </View>
      ) : (
        <FlatList
          data={stockItems}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => {
            const productImg = item.images?.[0]?.src || null;
            const isOutOfStock = item.stockStatus === 'outofstock' || item.stockQuantity === 0;

            return (
              <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3.5 flex-row justify-between items-center">
                
                {/* Product Meta */}
                <View className="flex-row items-center gap-3.5 flex-1 pr-4">
                  <View className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden justify-center items-center">
                    {productImg ? (
                      <ExpoImage 
                        source={{ uri: productImg }} 
                        style={{ width: '100%', height: '100%' }}
                        transition={200}
                      />
                    ) : (
                      <ShoppingBag size={20} color="#334155" />
                    )}
                  </View>
                  
                  <View className="flex-1 pr-2">
                    <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.sku ? (
                      <Text className="text-slate-500 text-[9px] font-bold mt-1 uppercase">
                        SKU: {item.sku}
                      </Text>
                    ) : null}
                    <Text className={`text-[10px] font-bold mt-1 ${isOutOfStock ? 'text-red-400' : 'text-amber-400'}`}>
                      In Stock: {item.stockQuantity !== null ? item.stockQuantity : 0} units
                    </Text>
                  </View>
                </View>

                {/* Quick Stock Controls */}
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => adjustStock(item, -1)}
                    className="h-9 w-9 bg-slate-100 rounded-lg items-center justify-center active:bg-slate-750"
                  >
                    <Minus size={15} color="#94A3B8" />
                  </Pressable>
                  
                  <View className="w-8 items-center">
                    <Text className="text-slate-900 font-bold text-sm">
                      {item.stockQuantity !== null ? item.stockQuantity : 0}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => adjustStock(item, 1)}
                    className="h-9 w-9 bg-blue-600 rounded-lg items-center justify-center active:bg-blue-700"
                  >
                    <Plus size={15} color="#FFFFFF" />
                  </Pressable>
                </View>

              </View>
            );
          }}
        />
      )}

    </View>
  );
}
