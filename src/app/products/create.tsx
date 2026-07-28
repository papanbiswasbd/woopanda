import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '../../shared/database/db';
import { products } from '../../shared/database/schema';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { Plus } from 'lucide-react-native';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';
import CategorySelector from '../../components/CategorySelector';

export default function CreateProductScreen() {
  const router = useRouter();
  const currency = useSettingsStore(state => state.currency);
  const symbol = getCurrencySymbol(currency);
  const params = useLocalSearchParams();
  const prefilledSku = params.sku ? String(params.sku) : '';

  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('simple');
  const [sku, setSku] = useState(prefilledSku);
  const [barcode, setBarcode] = useState(prefilledSku); // Map scanned barcode to barcode and sku
  const [regularPrice, setRegularPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [manageStock, setManageStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockStatus, setStockStatus] = useState('instock');
  const [status, setStatus] = useState('publish');
  const [selectedCategories, setSelectedCategories] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  
  // WooCommerce shipping options
  const [virtual, setVirtual] = useState(false);
  const [downloadable, setDownloadable] = useState(false);
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // WooCommerce advanced options
  const [backorders, setBackorders] = useState('no');
  const [soldIndividually, setSoldIndividually] = useState(false);
  const [reviewsAllowed, setReviewsAllowed] = useState(true);
  const [purchaseNote, setPurchaseNote] = useState('');
  const [menuOrder, setMenuOrder] = useState('0');

  // Handle prefilled value updates if parameters change
  useEffect(() => {
    if (params.sku) {
      setSku(String(params.sku));
      setBarcode(String(params.sku));
    }
  }, [params.sku]);

  // Create Product (Optimistic + Offline Queue)
  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Product title is required.');
      return;
    }

    if (!regularPrice.trim()) {
      Alert.alert('Validation Error', 'Regular price is required.');
      return;
    }

    setSaving(true);
    const tempId = -1 * Math.floor(Date.now()); // Generate unique negative ID for offline caching
    const stockQtyVal = manageStock && stockQuantity.trim() !== '' ? Number(stockQuantity) : null;
    const finalStockStatus = stockQtyVal !== null && stockQtyVal <= 0 ? 'outofstock' : stockStatus;
    const menuOrderVal = menuOrder.trim() !== '' ? Number(menuOrder) : 0;
    const finalCategories = selectedCategories.map(c => ({ id: c.id, name: c.name, slug: c.slug }));

    try {
      // 1. Optimistic insert in SQLite database
      const newProductCached = {
        id: tempId,
        name: name.trim(),
        slug: slug.trim(),
        permalink: '',
        type,
        status,
        description: description,
        shortDescription: shortDescription,
        price: salePrice.trim() !== '' ? salePrice.trim() : regularPrice.trim(),
        regularPrice: regularPrice.trim(),
        salePrice: salePrice.trim(),
        onSale: salePrice.trim() !== '' && Number(salePrice) < Number(regularPrice),
        purchasable: true,
        manageStock: manageStock,
        stockQuantity: stockQtyVal,
        stockStatus: finalStockStatus,
        sku: sku.trim(),
        barcode: barcode.trim(),
        images: JSON.stringify([]), // Empty images array on create
        categories: JSON.stringify(finalCategories),
        attributes: JSON.stringify([]),
        lastUpdated: Date.now(),
        menuOrder: menuOrderVal,
        virtual: virtual,
        downloadable: downloadable,
        weight: weight.trim(),
        length: length.trim(),
        width: width.trim(),
        height: height.trim(),
        backorders,
        soldIndividually: soldIndividually,
        reviewsAllowed: reviewsAllowed,
        purchaseNote: purchaseNote.trim(),
      };

      await db.insert(products).values(newProductCached);

      // 2. Queue sync CREATE action
      const syncPayload = {
        name: name.trim(),
        slug: slug.trim(),
        type,
        regular_price: regularPrice.trim(),
        sale_price: salePrice.trim(),
        sku: sku.trim(),
        manage_stock: manageStock,
        stock_quantity: stockQtyVal,
        stock_status: finalStockStatus,
        status: status,
        description: description,
        short_description: shortDescription,
        virtual,
        downloadable,
        weight: weight.trim(),
        dimensions: {
          length: length.trim(),
          width: width.trim(),
          height: height.trim(),
        },
        backorders,
        sold_individually: soldIndividually,
        reviews_allowed: reviewsAllowed,
        purchase_note: purchaseNote.trim(),
        menu_order: menuOrderVal,
        categories: finalCategories,
        meta_data: [
          {
            key: '_barcode',
            value: barcode.trim(), // Store custom barcode field in WooCommerce metadata
          }
        ]
      };

      await syncQueueService.enqueue('CREATE_PRODUCT', syncPayload);

      // Trigger sync worker
      syncQueueService.processQueue().catch(() => {});

      Alert.alert('Success', 'Product created (Enqueued for background sync)', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('Failed to create product optimistically:', err);
      Alert.alert('Error', 'Failed to save product to local database cache.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50 px-5 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
      
      {/* 1. General Product Details Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">General Settings</Text>

        {/* Name input */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Product Title *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Wireless Noise Cancelling Headphones"
            placeholderTextColor="#475569"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
          />
        </View>

        {/* Product Type selector */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Product Type</Text>
          <View className="flex-row flex-wrap gap-2.5">
            {['simple', 'grouped', 'external', 'variable'].map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                className={`px-3 h-10 rounded-xl justify-center items-center border ${
                  type === t 
                    ? 'bg-blue-500/10 border-blue-500' 
                    : 'bg-slate-50 border-slate-200'
                }`}
                style={{ minWidth: '45%' }}
              >
                <Text className={`text-xs font-bold uppercase ${
                  type === t ? 'text-blue-400' : 'text-slate-500'
                }`}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Slug input */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Product Slug</Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            placeholder="product-slug-identifier"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
          />
        </View>

        {/* Publish Status selector */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Publish Status</Text>
          <View className="flex-row gap-2.5">
            {['publish', 'draft', 'private', 'pending'].map((item) => (
              <Pressable
                key={item}
                onPress={() => setStatus(item)}
                className={`flex-1 h-10 rounded-xl justify-center items-center border ${
                  status === item 
                    ? 'bg-blue-500/10 border-blue-500' 
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Text className={`text-[10px] font-bold uppercase ${
                  status === item ? 'text-blue-400' : 'text-slate-500'
                }`}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Categories Selector */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Categories</Text>
          <CategorySelector 
            selectedCategories={selectedCategories} 
            onChange={setSelectedCategories} 
          />
        </View>

      </View>

      {/* 2. Pricing Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">Pricing Settings</Text>

        {/* Pricing Rows */}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-slate-600 font-semibold text-xs mb-2">Regular Price ({symbol}) *</Text>
            <TextInput
              value={regularPrice}
              onChangeText={setRegularPrice}
              placeholder="0.00"
              placeholderTextColor="#475569"
              keyboardType="decimal-pad"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
            />
          </View>
          
          <View className="flex-1">
            <Text className="text-slate-600 font-semibold text-xs mb-2">Sale Price ({symbol})</Text>
            <TextInput
              value={salePrice}
              onChangeText={setSalePrice}
              placeholder="Optional"
              placeholderTextColor="#475569"
              keyboardType="decimal-pad"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
            />
          </View>
        </View>
      </View>

      {/* 3. Inventory Control Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">Inventory & Stock</Text>
        
        {/* SKU & Barcode scanner link */}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-slate-600 font-semibold text-xs mb-2">SKU Identifier</Text>
            <TextInput
              value={sku}
              onChangeText={setSku}
              placeholder="e.g. WH-1000XM4"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
            />
          </View>
          
          <View className="flex-1">
            <Text className="text-slate-600 font-semibold text-xs mb-2">Barcode UPC/EAN</Text>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder="e.g. 4548736112100"
              placeholderTextColor="#475569"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
            />
          </View>
        </View>

        {/* Manage Stock Toggle */}
        <View className="flex-row justify-between items-center border-t border-slate-100 pt-3">
          <View>
            <Text className="text-slate-700 font-bold text-xs">Track inventory stock levels</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Enables tracking of specific item quantity</Text>
          </View>
          <Switch 
            value={manageStock} 
            onValueChange={setManageStock}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#64748B', true: '#3B82F6' }}
          />
        </View>

        {manageStock ? (
          <View className="mb-2 border-t border-slate-100 pt-3">
            <Text className="text-slate-600 font-semibold text-xs mb-2">Quantity in Warehouse</Text>
            <TextInput
              value={stockQuantity}
              onChangeText={setStockQuantity}
              placeholder="e.g. 50"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
            />
          </View>
        ) : (
          <View className="mb-2 border-t border-slate-100 pt-3">
            <Text className="text-slate-600 font-semibold text-xs mb-2">Stock Status</Text>
            <View className="flex-row gap-3">
              {['instock', 'outofstock', 'onbackorder'].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setStockStatus(item)}
                  className={`flex-1 h-10 rounded-xl justify-center items-center border ${
                    stockStatus === item 
                      ? 'bg-blue-500/10 border-blue-500' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <Text className={`text-[10px] font-bold uppercase ${
                    stockStatus === item ? 'text-blue-400' : 'text-slate-500'
                  }`}>
                    {item === 'instock' ? 'In Stock' : item === 'outofstock' ? 'Out of stock' : 'Backorder'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* WooCommerce Backorders selector */}
        <View className="border-t border-slate-100 pt-3">
          <Text className="text-slate-600 font-semibold text-xs mb-2">Allow Backorders?</Text>
          <View className="flex-row gap-2">
            {[
              { label: 'Do not allow', value: 'no' },
              { label: 'Allow & Notify', value: 'notify' },
              { label: 'Allow', value: 'yes' },
            ].map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setBackorders(opt.value)}
                className={`flex-1 h-10 px-1 rounded-xl justify-center items-center border ${
                  backorders === opt.value 
                    ? 'bg-blue-500/10 border-blue-500' 
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Text className={`text-[10px] font-bold text-center ${
                  backorders === opt.value ? 'text-blue-400' : 'text-slate-500'
                }`}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Sold Individually Switch */}
        <View className="flex-row justify-between items-center border-t border-slate-100 pt-3">
          <View>
            <Text className="text-slate-700 font-bold text-xs">Sold individually</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Limit purchases to 1 item per order</Text>
          </View>
          <Switch 
            value={soldIndividually} 
            onValueChange={setSoldIndividually}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#64748B', true: '#3B82F6' }}
          />
        </View>

      </View>

      {/* 4. Shipping Settings Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">Shipping & Dimensions</Text>
        
        {/* Virtual Product Switch */}
        <View className="flex-row justify-between items-center pb-2">
          <View>
            <Text className="text-slate-700 font-bold text-xs">Virtual Product</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Non-tangible product (skips shipping)</Text>
          </View>
          <Switch 
            value={virtual} 
            onValueChange={setVirtual}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#64748B', true: '#3B82F6' }}
          />
        </View>

        {/* Downloadable Product Switch */}
        <View className="flex-row justify-between items-center border-t border-slate-100 pt-3 pb-2">
          <View>
            <Text className="text-slate-700 font-bold text-xs">Downloadable Product</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Gives access to digital file download</Text>
          </View>
          <Switch 
            value={downloadable} 
            onValueChange={setDownloadable}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#64748B', true: '#3B82F6' }}
          />
        </View>

        {!virtual && (
          <View className="border-t border-slate-100 pt-4 gap-4">
            {/* Weight input */}
            <View>
              <Text className="text-slate-600 font-semibold text-xs mb-2">Weight (kg)</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                placeholder="0.0"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
                className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
              />
            </View>

            {/* Length, Width, Height */}
            <Text className="text-slate-600 font-semibold text-xs mb-1">Dimensions (L × W × H) (cm)</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextInput
                  value={length}
                  onChangeText={setLength}
                  placeholder="L"
                  placeholderTextColor="#475569"
                  keyboardType="decimal-pad"
                  className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm text-center"
                />
              </View>
              <View className="flex-1">
                <TextInput
                  value={width}
                  onChangeText={setWidth}
                  placeholder="W"
                  placeholderTextColor="#475569"
                  keyboardType="decimal-pad"
                  className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm text-center"
                />
              </View>
              <View className="flex-1">
                <TextInput
                  value={height}
                  onChangeText={setHeight}
                  placeholder="H"
                  placeholderTextColor="#475569"
                  keyboardType="decimal-pad"
                  className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm text-center"
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* 5. Descriptions Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">Descriptions</Text>

        {/* Short Description */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Short Description</Text>
          <TextInput
            value={shortDescription}
            onChangeText={setShortDescription}
            placeholder="Type short subtitle description..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl py-2 px-3 text-sm min-h-[60px]"
          />
        </View>

        {/* Description */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Full Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Type full product specifications..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl py-2 px-3 text-sm min-h-[100px]"
          />
        </View>
      </View>

      {/* 6. Advanced Settings Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">Advanced Settings</Text>

        {/* Menu Order */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Menu Order</Text>
          <TextInput
            value={menuOrder}
            onChangeText={setMenuOrder}
            placeholder="0"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl h-11 px-3 text-sm"
          />
        </View>

        {/* Purchase Note */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Purchase Note</Text>
          <TextInput
            value={purchaseNote}
            onChangeText={setPurchaseNote}
            placeholder="Optional customer purchase note..."
            placeholderTextColor="#475569"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl py-2 px-3 text-sm min-h-[60px]"
          />
        </View>

        {/* Reviews Allowed Toggle */}
        <View className="flex-row justify-between items-center border-t border-slate-100 pt-3">
          <View>
            <Text className="text-slate-700 font-bold text-xs">Allow Reviews</Text>
            <Text className="text-slate-500 text-[10px] mt-0.5">Enable customer reviews on shop page</Text>
          </View>
          <Switch 
            value={reviewsAllowed} 
            onValueChange={setReviewsAllowed}
            thumbColor="#FFFFFF"
            trackColor={{ false: '#64748B', true: '#3B82F6' }}
          />
        </View>
      </View>

      {/* Submit Button */}
      <Pressable
        onPress={handleCreate}
        disabled={saving}
        className="bg-blue-600 h-12 rounded-2xl flex-row items-center justify-center gap-2 active:bg-blue-700 shadow-md shadow-blue-500/20"
      >
        {saving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Plus size={18} color="#FFFFFF" />
            <Text className="text-white font-bold text-base">Create Product</Text>
          </>
        )}
      </Pressable>

    </ScrollView>
  );
}
