import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, sqlite } from '../../shared/database/db';
import { products } from '../../shared/database/schema';
import { eq } from 'drizzle-orm';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { Save, Trash2, Image as ImageIcon, Plus, Edit, X, Upload, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSettingsStore, getCurrencySymbol } from '../../shared/store/settingsStore';
import CategorySelector from '../../components/CategorySelector';
import * as ImagePicker from 'expo-image-picker';

export default function EditProductScreen() {
  const router = useRouter();
  const currency = useSettingsStore(state => state.currency);
  const symbol = getCurrencySymbol(currency);
  const { id } = useLocalSearchParams();
  const productId = Number(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('simple');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [manageStock, setManageStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockStatus, setStockStatus] = useState('instock');
  const [status, setStatus] = useState('publish');
  const [images, setImages] = useState<any[]>([]);
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

  // Load product details from SQLite
  useEffect(() => {
    try {
      const res = sqlite.getAllSync<any>(
        `SELECT id, name, sku, barcode, regular_price as regularPrice, sale_price as salePrice, manage_stock as manageStock, stock_quantity as stockQuantity, stock_status as stockStatus, status, images, description, short_description as shortDescription, slug, type, virtual, downloadable, weight, length, width, height, backorders, sold_individually as soldIndividually, reviews_allowed as reviewsAllowed, purchase_note as purchaseNote, menu_order as menuOrder, categories 
         FROM products 
         WHERE id = ? LIMIT 1`,
        productId
      );

      if (res && res.length > 0) {
        const row = res[0];
        setName(row.name || '');
        setSlug(row.slug || '');
        setType(row.type || 'simple');
        setSku(row.sku || '');
        setBarcode(row.barcode || '');
        setRegularPrice(row.regularPrice || '');
        setSalePrice(row.salePrice || '');
        setManageStock(row.manageStock === 1);
        setStockQuantity(row.stockQuantity !== null ? String(row.stockQuantity) : '');
        setStockStatus(row.stockStatus || 'instock');
        setStatus(row.status || 'publish');
        setDescription(row.description || '');
        setShortDescription(row.shortDescription || '');
        setVirtual(row.virtual === 1);
        setDownloadable(row.downloadable === 1);
        setWeight(row.weight || '');
        setLength(row.length || '');
        setWidth(row.width || '');
        setHeight(row.height || '');
        setBackorders(row.backorders || 'no');
        setSoldIndividually(row.soldIndividually === 1);
        setReviewsAllowed(row.reviewsAllowed === 1);
        setPurchaseNote(row.purchaseNote || '');
        setMenuOrder(row.menuOrder !== null ? String(row.menuOrder) : '0');
        
        let imgList = [];
        try {
          imgList = row.images ? JSON.parse(row.images) : [];
        } catch {}
        setImages(imgList);

        let catList = [];
        try {
          catList = row.categories ? JSON.parse(row.categories) : [];
        } catch {}
        setSelectedCategories(catList.map((c: any) => ({ name: c.name, slug: c.slug, id: c.id })));
      } else {
        Alert.alert('Error', 'Product not found in local cache.');
        router.back();
      }
    } catch (err) {
      console.error('Failed to load product details:', err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  // Pick Main Thumbnail Image
  const handlePickThumbnail = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newUri = result.assets[0].uri;
        const newThumb = { src: newUri, name: `thumb-${Date.now()}.jpg`, position: 0 };
        setImages((prev) => {
          if (prev.length === 0) return [newThumb];
          return [newThumb, ...prev.slice(1)];
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to select image from photo library.');
    }
  };

  // Remove Main Thumbnail Image
  const handleRemoveThumbnail = () => {
    Alert.alert('Remove Thumbnail', 'Are you sure you want to remove the main product thumbnail?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setImages((prev) => prev.slice(1));
      }}
    ]);
  };

  // Add Gallery Images (supports multi-selection)
  const handleAddGalleryImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newGalleryItems = result.assets.map((a, idx) => ({
          src: a.uri,
          name: `gallery-${Date.now()}-${idx}.jpg`
        }));
        setImages((prev) => [...prev, ...newGalleryItems]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick gallery images.');
    }
  };

  // Remove a specific gallery image (by its true index in the images array)
  const handleRemoveGalleryImage = (actualIndex: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== actualIndex));
  };

  // Handle Manual Reordering (Move Left / Right)
  const handleMoveGalleryImage = (actualIndex: number, direction: 'left' | 'right') => {
    setImages((prev) => {
      const newArray = [...prev];
      const targetIndex = direction === 'left' ? actualIndex - 1 : actualIndex + 1;
      
      // Ensure we don't swap with the main thumbnail (index 0) or go out of bounds
      if (targetIndex < 1 || targetIndex >= newArray.length) return prev;

      // Swap
      const temp = newArray[actualIndex];
      newArray[actualIndex] = newArray[targetIndex];
      newArray[targetIndex] = temp;
      
      return newArray;
    });
  };

  // Save edits (Optimistic update + queue back sync)
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Product title is required.');
      return;
    }

    setSaving(true);
    const stockQtyVal = manageStock && stockQuantity.trim() !== '' ? Number(stockQuantity) : null;
    const finalStockStatus = stockQtyVal !== null && stockQtyVal <= 0 ? 'outofstock' : stockStatus;
    const menuOrderVal = menuOrder.trim() !== '' ? Number(menuOrder) : 0;
    const finalCategories = selectedCategories.map(c => ({ id: c.id, name: c.name, slug: c.slug }));

    try {
      // 1. Update SQLite locally
      sqlite.runSync(
        `UPDATE products 
         SET name = ?, sku = ?, barcode = ?, regular_price = ?, price = ?, sale_price = ?, manage_stock = ?, stock_quantity = ?, stock_status = ?, status = ?, description = ?, short_description = ?, slug = ?, type = ?, virtual = ?, downloadable = ?, weight = ?, length = ?, width = ?, height = ?, backorders = ?, sold_individually = ?, reviews_allowed = ?, purchase_note = ?, menu_order = ?, categories = ?, images = ?, last_updated = ?
         WHERE id = ?`,
        name.trim(),
        sku.trim(),
        barcode.trim(),
        regularPrice.trim(),
        salePrice.trim() !== '' ? salePrice.trim() : regularPrice.trim(), // active price
        salePrice.trim(),
        manageStock ? 1 : 0,
        stockQtyVal,
        finalStockStatus,
        status,
        description,
        shortDescription,
        slug.trim(),
        type,
        virtual ? 1 : 0,
        downloadable ? 1 : 0,
        weight.trim(),
        length.trim(),
        width.trim(),
        height.trim(),
        backorders,
        soldIndividually ? 1 : 0,
        reviewsAllowed ? 1 : 0,
        purchaseNote.trim(),
        menuOrderVal,
        JSON.stringify(finalCategories),
        JSON.stringify(images),
        Date.now(),
        productId
      );

      // 2. Queue updates to API
      const apiPayload = {
        id: productId,
        name: name.trim(),
        slug: slug.trim(),
        type,
        regular_price: regularPrice.trim(),
        sale_price: salePrice.trim(),
        sku: sku.trim(),
        manage_stock: manageStock,
        stock_quantity: stockQtyVal,
        stock_status: finalStockStatus,
        status,
        description,
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
        images: images.map((img: any, idx: number) => ({
          ...(img.id ? { id: img.id } : { id: 0 }),
          src: img.src,
          position: idx
        })),
        meta_data: [
          {
            key: '_barcode',
            value: barcode.trim(),
          }
        ]
      };

      await syncQueueService.enqueue('UPDATE_PRODUCT', apiPayload);

      // Trigger queue task processor
      syncQueueService.processQueue().catch(() => {});

      Alert.alert('Success', 'Product updated successfully (Saved locally)', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('Failed to save product edits:', err);
      Alert.alert('Error', 'Failed to update product details locally.');
    } finally {
      setSaving(false);
    }
  };

  // Trash product from editor
  const handleTrash = () => {
    Alert.alert(
      'Move to Trash',
      `Are you sure you want to trash "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Trash', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete locally
              await db.delete(products).where(eq(products.id, productId));
              // Queue sync delete task
              await syncQueueService.enqueue('DELETE_PRODUCT', { id: productId });
              // Process queue
              syncQueueService.processQueue().catch(() => {});
              router.back();
            } catch (err) {
              console.error('Failed to delete product:', err);
            }
          }
        }
      ]
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
      
      {/* Product Media Suite: Main Thumbnail & Gallery (Max 8px border radius) */}
      <View className="bg-white border border-slate-200 rounded-lg p-5 mb-5 shadow-sm">
        
        {/* Main Thumbnail Section */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View className="bg-blue-500/10 p-2 rounded-md">
              <ImageIcon size={16} color="#3B82F6" />
            </View>
            <Text className="text-slate-800 font-black text-sm">Main Thumbnail</Text>
          </View>
          {images.length > 0 && (
            <Pressable
              onPress={handlePickThumbnail}
              className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-md active:bg-slate-200"
            >
              <Text className="text-slate-700 font-bold text-xs">Change</Text>
            </Pressable>
          )}
        </View>

        {images.length > 0 ? (
          <Pressable 
            onPress={handlePickThumbnail}
            className="w-full h-52 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden relative mb-6 active:opacity-80"
          >
            <ExpoImage 
              source={{ uri: images[0].src }} 
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
            {/* Overlay instruction to make changing extremely obvious */}
            <View className="absolute inset-0 bg-slate-900/20 items-center justify-center" pointerEvents="none">
              <View className="bg-slate-900/80 px-3 py-1.5 rounded-full flex-row items-center gap-1.5 border border-white/20">
                <ImageIcon size={14} color="#FFFFFF" />
                <Text className="text-white text-xs font-bold">Tap to change</Text>
              </View>
            </View>
            <Pressable
              onPress={handleRemoveThumbnail}
              className="absolute top-2 right-2 bg-red-600/90 w-8 h-8 rounded-md items-center justify-center shadow-sm active:bg-red-700"
            >
              <Trash2 size={15} color="#FFFFFF" />
            </Pressable>
            <View className="absolute bottom-2 left-2 bg-slate-900/90 px-2.5 py-1 rounded">
              <Text className="text-white text-[10px] font-extrabold uppercase">Primary Display</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={handlePickThumbnail}
            className="w-full h-44 rounded-lg bg-slate-50 border border-dashed border-slate-300 items-center justify-center mb-6 active:bg-slate-100"
          >
            <Upload size={32} color="#3B82F6" />
            <Text className="text-slate-800 font-black text-sm mt-3">+ Upload Main Thumbnail</Text>
            <Text className="text-slate-400 text-xs font-medium mt-1">Select from photo library</Text>
          </Pressable>
        )}

        {/* Gallery Images Section */}
        <View className="border-t border-slate-150 pt-5">
          <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2">
            <View className="flex-1 min-w-[180px]">
              <Text className="text-slate-800 font-black text-sm">
                Product Gallery ({images.length > 1 ? images.length - 1 : 0})
              </Text>
              <Text className="text-slate-500 text-xs mt-0.5">Use the arrows to reorder gallery photos</Text>
            </View>
            <Pressable
              onPress={handleAddGalleryImages}
              className="bg-blue-600 px-3.5 py-2 rounded-md flex-row items-center gap-1.5 shadow-sm shadow-blue-500/30 active:bg-blue-700"
            >
              <Plus size={14} color="#FFFFFF" />
              <Text className="text-white font-black text-xs">Add Images</Text>
            </Pressable>
          </View>

          {images.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="w-full pb-2">
              <View className="flex-row items-center gap-3">
                {images.slice(1).map((img: any, idx: number) => {
                  const actualIndex = idx + 1;
                  const isFirstGallery = actualIndex === 1;
                  const isLastGallery = actualIndex === images.length - 1;

                  return (
                    <View 
                      key={`gallery-${actualIndex}-${img.src}`}
                      className="w-28 h-28 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden relative shadow-xs"
                    >
                      <ExpoImage 
                        source={{ uri: img.src }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      
                      {/* Top Action Bar (Move & Delete) */}
                      <View className="absolute top-1 left-1 right-1 flex-row items-center justify-between pointer-events-auto">
                        <View className="flex-row gap-1">
                          {!isFirstGallery && (
                            <Pressable
                              onPress={() => handleMoveGalleryImage(actualIndex, 'left')}
                              className="bg-slate-900/80 w-6 h-6 rounded items-center justify-center active:bg-slate-700"
                            >
                              <ChevronLeft size={14} color="#FFFFFF" />
                            </Pressable>
                          )}
                          {!isLastGallery && (
                            <Pressable
                              onPress={() => handleMoveGalleryImage(actualIndex, 'right')}
                              className="bg-slate-900/80 w-6 h-6 rounded items-center justify-center active:bg-slate-700"
                            >
                              <ChevronRight size={14} color="#FFFFFF" />
                            </Pressable>
                          )}
                        </View>
                        <Pressable
                          onPress={() => handleRemoveGalleryImage(actualIndex)}
                          className="bg-red-600/90 w-6 h-6 rounded items-center justify-center active:bg-red-700"
                        >
                          <X size={12} color="#FFFFFF" />
                        </Pressable>
                      </View>

                      <View className="absolute bottom-1.5 left-1.5 bg-slate-900/80 px-2 py-0.5 rounded">
                        <Text className="text-white text-[10px] font-bold">#{actualIndex}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View className="bg-slate-50 rounded-lg p-6 items-center border border-slate-200/80">
              <ImageIcon size={24} color="#CBD5E1" />
              <Text className="text-slate-500 text-xs font-semibold mt-2 text-center">
                No extra gallery photos attached. Click "Add Images" above to attach gallery photos.
              </Text>
            </View>
          )}
        </View>

      </View>

      {/* 1. General Product Details Card */}
      <View className="bg-white border border-slate-200 rounded-3xl p-5 mb-5 gap-4">
        <Text className="text-slate-900 font-extrabold text-sm mb-1">General Settings</Text>

        {/* Name input */}
        <View>
          <Text className="text-slate-600 font-semibold text-xs mb-2">Product Title *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Type product name..."
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
            <Text className="text-slate-600 font-semibold text-xs mb-2">Regular Price ({symbol})</Text>
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
              placeholder="sku-prefix"
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
              placeholder="Scan/Insert"
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
              placeholder="0"
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

      {/* Editor Primary Action Triggers */}
      <View className="flex-row gap-4">
        
        <Pressable
          onPress={handleTrash}
          className="bg-red-500/10 h-12 w-12 rounded-2xl items-center justify-center border border-red-500/20 active:bg-red-500/20"
        >
          <Trash2 size={20} color="#EF4444" />
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 h-12 rounded-2xl flex-row items-center justify-center gap-2 active:bg-blue-700 shadow-md shadow-blue-500/20"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Save size={18} color="#FFFFFF" />
              <Text className="text-white font-bold text-base">Save Changes</Text>
            </>
          )}
        </Pressable>

      </View>

    </ScrollView>
  );
}
