import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl, Modal, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { syncService } from '../../shared/services/syncService';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { Search, ScanBarcode, Plus, Edit2, Trash2, ShoppingCart, ChevronRight } from 'lucide-react-native';
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
        rows = sqlite.getAllSync<any>(
          `SELECT id, name, price, stock_quantity as stockQuantity, stock_status as stockStatus, sku, images, manage_stock as manageStock, regular_price as regularPrice, sale_price as salePrice, menu_order as menuOrder 
           FROM products 
           WHERE name LIKE ? OR sku LIKE ? 
           ORDER BY menu_order ASC, name ASC`,
          queryTerm, queryTerm
        );
      } else {
        rows = sqlite.getAllSync<any>(
          `SELECT id, name, price, stock_quantity as stockQuantity, stock_status as stockStatus, sku, images, manage_stock as manageStock, regular_price as regularPrice, sale_price as salePrice, menu_order as menuOrder 
           FROM products 
           ORDER BY menu_order ASC, name ASC`
        );
      }

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
        };
      });

      setProductList(parsed);
    } catch (error) {
      console.error('Failed to load local cached products:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery]);

  // Load cache on focus and search query changes
  useFocusEffect(
    useCallback(() => {
      loadLocalProducts();
    }, [loadLocalProducts])
  );

  useEffect(() => {
    loadLocalProducts();
  }, [debouncedSearchQuery, loadLocalProducts]);

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

                    {/* Stock Status Badge */}
                    <View className="flex-row mt-1.5">
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
                    </View>
                  </View>

                  <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }} />
                </View>

                {/* Expanded Actions Tray */}
                {isExpanded && (
                  <View className="border-t border-slate-100 mt-3 pt-3 flex-row justify-between items-center">
                    {item.manageStock ? (
                      <View className="flex-row items-center border border-slate-200 rounded overflow-hidden h-8 bg-slate-50">
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
                    ) : (
                      <View className="px-2.5 h-8 justify-center rounded bg-slate-100 border border-slate-200">
                        <Text className="text-slate-500 text-[10px] font-bold uppercase">No Limit</Text>
                      </View>
                    )}

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

    </View>
  );
}
