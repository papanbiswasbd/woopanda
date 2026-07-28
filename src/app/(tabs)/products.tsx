import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl, Modal, Alert, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { Search, ScanBarcode, Plus, Edit2, Trash2, ShoppingCart, ChevronRight, X, Layers, PieChart, Package } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';

export default function ProductsScreen() {
  const router = useRouter();
  const currency = useSettingsStore(state => state.currency);
  const symbol = getCurrencySymbol(currency);
  
  const [productList, setProductList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Quick Edit Modal state
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickStock, setQuickStock] = useState('');
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [selectedBreakdownProduct, setSelectedBreakdownProduct] = useState<any | null>(null);

  const formatCurrency = (amount: number) => {
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

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Retrieve products from local cache
  const loadLocalProducts = useCallback(async () => {
    try {
      let rows: any[] = [];
      const query = debouncedSearchQuery.trim();
      if (query.length > 0) {
        const queryTerm = `%${query}%`;
        rows = await sqlite.getAllAsync<any>(
          `SELECT id, name, price, stock_quantity as stockQuantity, stock_status as stockStatus, sku, images, manage_stock as manageStock, regular_price as regularPrice, sale_price as salePrice, menu_order as menuOrder 
           FROM products 
           WHERE name LIKE ? OR sku LIKE ? 
           ORDER BY menu_order ASC, name ASC`,
          queryTerm, queryTerm
        );
      } else {
        rows = await sqlite.getAllAsync<any>(
          `SELECT id, name, price, stock_quantity as stockQuantity, stock_status as stockStatus, sku, images, manage_stock as manageStock, regular_price as regularPrice, sale_price as salePrice, menu_order as menuOrder 
           FROM products 
           ORDER BY menu_order ASC, name ASC`
        );
      }

      // Pre-calculate Total Sell quantity across all orders
      const orderLinesRows = await sqlite.getAllAsync<{ line_items: string }>(`SELECT line_items FROM orders`);
      const salesMap = new Map<number, number>();
      orderLinesRows.forEach((o) => {
        if (!o.line_items) return;
        try {
          const items = JSON.parse(o.line_items);
          if (Array.isArray(items)) {
            items.forEach((line: any) => {
              const pid = Number(line.product_id || line.id);
              if (!pid) return;
              const parsedQty = parseInt(String(line.quantity ?? line.qty ?? 0), 10);
              const qty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
              salesMap.set(pid, (salesMap.get(pid) || 0) + qty);
            });
          }
        } catch {}
      });

      const parsed = rows.map((r: any) => {
        let imgs: any[] = [];
        try {
          imgs = r.images ? JSON.parse(r.images) : [];
        } catch {}
        return {
          id: r.id,
          name: r.name,
          price: r.price,
          stockQuantity: r.stockQuantity,
          stockStatus: r.stockStatus,
          sku: r.sku,
          images: imgs,
          manageStock: r.manageStock === 1,
          regularPrice: r.regularPrice,
          salePrice: r.salePrice,
          menuOrder: r.menuOrder || 0,
          totalSell: salesMap.get(Number(r.id)) || 0,
        };
      });

      setProductList(parsed);
    } catch (error) {
      console.error('Failed to load local cached products:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery]);

  const loadLocalProductsRef = useRef(loadLocalProducts);
  useEffect(() => {
    loadLocalProductsRef.current = loadLocalProducts;
  }, [loadLocalProducts]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadLocalProductsRef.current();
  }, [debouncedSearchQuery]);

  // Load cache ONLY on focus
  useFocusEffect(
    useCallback(() => {
      loadLocalProductsRef.current();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncProducts();
    await loadLocalProducts();
    setRefreshing(false);
  };

  // Direct Stock Adjustments
  const adjustStock = async (product: any, delta: number) => {
    const currentStock = product.stockQuantity !== null ? product.stockQuantity : 0;
    const newStock = Math.max(0, currentStock + delta);
    
    try {
      // 1. Update SQLite locally
      sqlite.runSync(
        `UPDATE products 
         SET stock_quantity = ?, stock_status = ?, last_updated = ?
         WHERE id = ?`,
        newStock,
        newStock <= 0 ? 'outofstock' : 'instock',
        Date.now(),
        product.id
      );

      // 2. Queue write sync task
      const syncPayload = {
        id: product.id,
        manage_stock: true,
        stock_quantity: newStock,
      };

      await syncQueueService.enqueue('UPDATE_PRODUCT', syncPayload);

      // Update local state immediately
      setProductList(prev => prev.map(p => {
        if (p.id === product.id) {
          return {
            ...p,
            stockQuantity: newStock,
            stockStatus: newStock <= 0 ? 'outofstock' : 'instock',
          };
        }
        return p;
      }));

    } catch (e) {
      console.error('Failed to adjust stock:', e);
      Alert.alert('Database Error', 'Failed to update stock quantity locally.');
    }
  };

  // Trigger quick edit popup
  const openQuickEdit = (product: any) => {
    setSelectedProduct(product);
    setQuickPrice(product.price || '');
    setQuickStock(product.stockQuantity !== null ? String(product.stockQuantity) : '');
    setQuickEditVisible(true);
  };

  // Submit quick edit updates
  const saveQuickEdit = async () => {
    if (!selectedProduct) return;

    const newPrice = quickPrice.trim();
    const newStockVal = quickStock.trim() === '' ? null : Number(quickStock);

    try {
      // 1. Optimistic Update on SQLite Database
      sqlite.runSync(
        `UPDATE products 
         SET price = ?, regular_price = ?, stock_quantity = ?, stock_status = ?, last_updated = ?
         WHERE id = ?`,
        newPrice, 
        newPrice, 
        newStockVal, 
        newStockVal !== null && newStockVal <= 0 ? 'outofstock' : 'instock',
        Date.now(),
        selectedProduct.id
      );

      // 2. Queue background write sync action
      const syncPayload = {
        id: selectedProduct.id,
        regular_price: newPrice,
        manage_stock: selectedProduct.manageStock,
        stock_quantity: newStockVal,
      };

      await syncQueueService.enqueue('UPDATE_PRODUCT', syncPayload);
      
      // Update UI list state immediately
      setProductList(prev => prev.map(p => {
        if (p.id === selectedProduct.id) {
          return {
            ...p,
            price: newPrice,
            regularPrice: newPrice,
            stockQuantity: newStockVal,
            stockStatus: newStockVal !== null && newStockVal <= 0 ? 'outofstock' : 'instock',
          };
        }
        return p;
      }));

      setQuickEditVisible(false);
    } catch (error) {
      console.error('Failed to save quick edit:', error);
      Alert.alert('Error', 'Failed to save changes.');
    }
  };

  // Delete product action handler
  const handleTrashProduct = (product: any) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete ${product.name}? This will remove it from WooCommerce.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Delete locally from SQLite cache
              sqlite.runSync(`DELETE FROM products WHERE id = ?`, product.id);
              
              // 2. Queue WooCommerce delete action
              await syncQueueService.enqueue('DELETE_PRODUCT', { id: product.id });
              
              // 3. Update list state
              setProductList(prev => prev.filter(p => p.id !== product.id));
            } catch (err) {
              console.error('Failed to delete product:', err);
              Alert.alert('Error', 'Failed to delete product.');
            }
          }
        }
      ]
    );
  };

  // Smart Product Breakdown Calculation Engine across ALL Order Statuses
  const handleOpenBreakdown = async (product: any) => {
    setSelectedBreakdownProduct({ ...product, loadingBreakdown: true });
    try {
      const orderLinesRows = await sqlite.getAllAsync<{ line_items: string; status: string }>(
        `SELECT line_items, status FROM orders`
      );

      let totalQty = 0;
      let netRev = 0;
      const statusBreakdown: Record<string, { count: number; revenue: number }> = {};

      orderLinesRows.forEach((o) => {
        if (!o.line_items) return;
        const ordStatus = (o.status || 'unknown').toLowerCase().replace('wc-', '');
        try {
          const items = JSON.parse(o.line_items);
          if (Array.isArray(items)) {
            items.forEach((line: any) => {
              const pid = Number(line.product_id || line.id);
              if (pid === Number(product.id)) {
                const parsedQty = parseInt(String(line.quantity ?? line.qty ?? 0), 10);
                const qty = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
                const lineTotal = Number(line.total || line.subtotal) || 0;

                totalQty += qty;
                if (ordStatus !== 'cancelled' && ordStatus !== 'failed' && ordStatus !== 'trash') {
                  netRev += lineTotal;
                }

                if (!statusBreakdown[ordStatus]) {
                  statusBreakdown[ordStatus] = { count: 0, revenue: 0 };
                }
                statusBreakdown[ordStatus].count += qty;
                statusBreakdown[ordStatus].revenue += lineTotal;
              }
            });
          }
        } catch {}
      });

      setSelectedBreakdownProduct({
        ...product,
        totalQuantityAll: totalQty,
        revenueGenerated: netRev,
        statusBreakdown,
        loadingBreakdown: false,
      });
    } catch {
      setSelectedBreakdownProduct({
        ...product,
        totalQuantityAll: 0,
        revenueGenerated: 0,
        statusBreakdown: {},
        loadingBreakdown: false,
      });
    }
  };

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-4">
      
      {/* Search Header */}
      <View className="flex-row items-center gap-3 mb-4">
        <View className="flex-1 bg-white border border-slate-200 rounded px-3 h-11 flex-row items-center">
          <Search size={18} color="#64748B" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search products by title or SKU..."
            placeholderTextColor="#64748B"
            autoCorrect={false}
            className="flex-1 text-slate-900 ml-2.5 text-sm h-full"
          />
        </View>
        
        <Pressable 
          onPress={() => router.push('/products/scanner')}
          className="bg-white border border-slate-200 h-11 w-11 rounded items-center justify-center active:bg-slate-150"
        >
          <ScanBarcode size={20} color="#3B82F6" />
        </Pressable>

        <Pressable 
          onPress={() => router.push('/products/create')}
          className="bg-blue-600 h-11 w-11 rounded items-center justify-center active:bg-blue-700"
        >
          <Plus size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Main List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : productList.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <ShoppingCart size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">No products found</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-6">
            Swipe down to fetch products from WooCommerce or refine your search filters.
          </Text>
        </View>
      ) : (
        <FlatList
          data={productList}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
          }
          renderItem={({ item }) => {
            const productImg = item.images?.[0]?.src || null;
            const isLowStock = item.manageStock && item.stockQuantity !== null && item.stockQuantity <= 5;
            const isOutOfStock = item.stockStatus === 'outofstock' || (item.manageStock && item.stockQuantity !== null && item.stockQuantity === 0);

            const regularPriceNum = Number(item.regularPrice || 0);
            const salePriceNum = Number(item.salePrice || 0);
            const isOnSale = item.salePrice && salePriceNum < regularPriceNum;

            const isExpanded = expandedProductId === item.id;

            return (
              <Pressable
                onPress={() => setExpandedProductId(isExpanded ? null : item.id)}
                className="bg-white border border-slate-200 rounded p-3.5 mb-3.5 active:bg-slate-50"
              >
                <View className="flex-row gap-3.5 items-center">
                  
                  {/* Product Thumbnail */}
                  <View className="w-14 h-14 bg-slate-50 rounded overflow-hidden justify-center items-center border border-slate-100">
                    {productImg ? (
                      <ExpoImage 
                        source={{ uri: productImg }} 
                        style={{ width: '100%', height: '100%' }}
                        transition={200}
                      />
                    ) : (
                      <ShoppingCart size={20} color="#64748B" />
                    )}
                  </View>

                  {/* Details */}
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>
                      {item.name}
                    </Text>
                    
                    <View className="flex-row items-center flex-wrap gap-1.5 mt-1">
                      {isOnSale ? (
                        <>
                          <Text className="text-slate-400 line-through text-[10px] font-medium">
                            {symbol}{regularPriceNum.toFixed(2)}
                          </Text>
                          <Text className="text-blue-500 font-extrabold text-xs">
                            {symbol}{salePriceNum.toFixed(2)}
                          </Text>
                          <View className="bg-emerald-500/10 px-1 rounded">
                            <Text className="text-emerald-500 text-[8px] font-black uppercase">Sale</Text>
                          </View>
                        </>
                      ) : (
                        <Text className="text-blue-500 font-extrabold text-xs">
                          {symbol}{Number(item.price || 0).toFixed(2)}
                        </Text>
                      )}
                      {item.sku ? (
                        <Text className="text-slate-500 text-[10px] uppercase font-semibold">
                          • SKU: {item.sku}
                        </Text>
                      ) : null}
                    </View>

                    {/* Stock Status & Total Sell Badges (Max 8px border radius) */}
                    <View className="flex-row items-center flex-wrap gap-2 mt-1.5">
                      <View className={`px-2 py-0.5 rounded flex-row items-center gap-1 ${
                        isOutOfStock ? 'bg-red-500/10' :
                        isLowStock ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                      }`}>
                        <View className={`w-1.5 h-1.5 rounded-full ${
                          isOutOfStock ? 'bg-red-500' :
                          isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        <Text className={`text-[9px] font-extrabold uppercase ${
                          isOutOfStock ? 'text-red-400' :
                          isLowStock ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {isOutOfStock ? 'Out of stock' :
                           isLowStock ? `Low stock (${item.stockQuantity})` :
                           item.manageStock ? `In Stock (${item.stockQuantity})` : 'In Stock'}
                        </Text>
                      </View>

                      <View className="bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-md">
                        <Text className="text-[10px] font-black text-blue-700">
                          Total Sell: {item.totalSell || 0}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }} />
                </View>

                {/* Expanded Actions Tray */}
                {isExpanded && (
                  <View className="border-t border-slate-100 mt-3 pt-3 flex-row justify-between items-center gap-2 flex-wrap">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      {item.manageStock ? (
                        <View className="flex-row items-center border border-slate-200 rounded-md overflow-hidden h-8 bg-slate-50">
                          <Pressable 
                            onPress={() => adjustStock(item, -1)}
                            className="w-8 h-full items-center justify-center active:bg-slate-200"
                          >
                            <Text className="text-slate-600 font-bold text-sm">-</Text>
                          </Pressable>
                          <View className="px-2.5 h-full justify-center items-center bg-white border-x border-slate-200 min-w-[32px]">
                            <Text className="text-slate-800 font-extrabold text-xs">{item.stockQuantity}</Text>
                          </View>
                          <Pressable 
                            onPress={() => adjustStock(item, 1)}
                            className="w-8 h-full items-center justify-center active:bg-slate-200"
                          >
                            <Text className="text-slate-600 font-bold text-sm">+</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => handleOpenBreakdown(item)}
                        className="h-8 px-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-md justify-center items-center flex-row gap-1.5 active:bg-emerald-500/20"
                      >
                        <PieChart size={13} color="#10B981" />
                        <Text className="text-emerald-700 text-[11px] font-black">Product Breakdown</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row gap-1.5">
                      <Pressable 
                        onPress={() => router.push(`/products/${item.id}`)}
                        className="h-8 px-4 bg-slate-100 border border-slate-200 rounded items-center justify-center flex-row gap-1 active:bg-slate-200"
                      >
                        <Edit2 size={11} color="#475569" />
                        <Text className="text-slate-600 text-[10px] font-bold">Edit Product</Text>
                      </Pressable>
                      <Pressable 
                        onPress={() => handleTrashProduct(item)}
                        className="h-8 w-8 bg-red-500/10 rounded items-center justify-center active:bg-red-500/20"
                      >
                        <Trash2 size={12} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                )}

              </Pressable>
            );
          }}
        />
      )}

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
                        {formatCurrency(Number(selectedBreakdownProduct.price || 0))} / unit
                      </Text>
                      {selectedBreakdownProduct.stockQuantity !== null && selectedBreakdownProduct.stockQuantity !== undefined && (
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

                {selectedBreakdownProduct.loadingBreakdown ? (
                  <View className="py-12 items-center justify-center">
                    <ActivityIndicator size="large" color="#3B82F6" />
                    <Text className="text-slate-500 text-xs font-bold mt-3">Analyzing sales across all orders...</Text>
                  </View>
                ) : (
                  <>
                    {/* Total Sell Analytics Showcase Card (Max 8px border radius) */}
                    <View className="bg-slate-900 rounded-lg p-4 mb-6 shadow-sm flex-row justify-between items-center border border-slate-800">
                      <View className="flex-1 pr-2 border-r border-slate-800">
                        <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1" numberOfLines={1}>Sold Volume</Text>
                        <View className="flex-row items-baseline gap-1">
                          <Text className="text-emerald-400 font-black text-xl" numberOfLines={1} adjustsFontSizeToFit>
                            {selectedBreakdownProduct.totalQuantityAll || 0}
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
                            No orders recorded for this product yet.
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
                        <Text className="text-white font-extrabold text-sm">Edit Product Catalog</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setSelectedBreakdownProduct(null)}
                        className="bg-slate-100 px-6 h-12 rounded-lg items-center justify-center active:bg-slate-200 border border-slate-200/80"
                      >
                        <Text className="text-slate-700 font-extrabold text-sm">Close</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}
