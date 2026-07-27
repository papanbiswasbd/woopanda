import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Button, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { sqlite } from '../../shared/database/db';
import { X, RefreshCw, Zap } from 'lucide-react-native';

export default function BarcodeScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  if (!permission) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center px-6 text-center">
        <Text className="text-slate-900 text-lg font-bold mb-2">Camera Permission Needed</Text>
        <Text className="text-slate-600 text-sm mb-6 text-center">
          WooPanda requires camera access to scan barcodes of inventory products.
        </Text>
        <Pressable 
          onPress={requestPermission}
          className="bg-blue-600 px-6 py-3 rounded-xl active:bg-blue-700"
        >
          <Text className="text-slate-900 font-bold text-sm">Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    console.log(`Scanned barcode: ${data}`);

    try {
      // Search local cache for SKU or Barcode matching the scanned value
      const match = sqlite.getAllSync<{ id: number; name: string }>(
        `SELECT id, name FROM products WHERE sku = ? OR barcode = ? LIMIT 1`,
        data, data
      );

      if (match && match.length > 0) {
        const productId = match[0].id;
        const productName = match[0].name;
        
        console.log(`Matched product: ${productName} (ID: ${productId})`);
        // Navigate straight to product edit screen
        router.replace(`/products/${productId}`);
      } else {
        // Offer to create product
        Alert.alert(
          'Product Not Found',
          `No local product matches barcode/SKU: "${data}".\n\nWould you like to create a new product?`,
          [
            { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
            { 
              text: 'Create Product', 
              onPress: () => router.replace(`/products/create?sku=${encodeURIComponent(data)}`) 
            }
          ]
        );
      }
    } catch (err) {
      console.error('Failed to lookup barcode in database:', err);
      Alert.alert('Error', 'Failed to search database cache.');
      setScanned(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} className="bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'code128', 'code39'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        {/* Overlay HUD */}
        <View className="flex-1 justify-between p-6">
          
          {/* Header row */}
          <View className="flex-row justify-between items-center mt-8">
            <Pressable 
              onPress={() => router.back()}
              className="bg-slate-900/40 h-10 w-10 rounded-full items-center justify-center border border-white/10"
            >
              <X size={20} color="#FFFFFF" />
            </Pressable>
            
            <Text className="text-slate-900 font-bold text-sm bg-slate-900/40 px-4 py-1.5 rounded-full border border-white/10">
              Align Barcode in Frame
            </Text>

            <Pressable 
              onPress={() => setTorch(!torch)}
              className={`h-10 w-10 rounded-full items-center justify-center border ${
                torch ? 'bg-yellow-500 border-yellow-400' : 'bg-slate-900/40 border-white/10'
              }`}
            >
              <Zap size={18} color={torch ? '#000000' : '#FFFFFF'} />
            </Pressable>
          </View>

          {/* Central Scan Frame */}
          <View className="items-center justify-center">
            <View className="w-72 h-44 border-2 border-blue-500 rounded-2xl relative">
              {/* Corner indicators */}
              <View className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white -mt-0.5 -ml-0.5" />
              <View className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white -mt-0.5 -mr-0.5" />
              <View className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white -mb-0.5 -ml-0.5" />
              <View className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white -mb-0.5 -mr-0.5" />
              {/* Aiming laser line */}
              <View className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-blue-500/80" />
            </View>
          </View>

          {/* Footer instruction or retry button */}
          <View className="items-center mb-8">
            {scanned ? (
              <Pressable
                onPress={() => setScanned(false)}
                className="bg-blue-600 flex-row items-center gap-2 px-6 py-3 rounded-full shadow-lg active:bg-blue-700"
              >
                <RefreshCw size={16} color="#FFFFFF" />
                <Text className="text-slate-900 font-bold text-sm">Scan Another Product</Text>
              </Pressable>
            ) : (
              <Text className="text-slate-900/60 text-xs text-center px-8 leading-normal">
                Supports EAN-13, EAN-8, UPC, Code-128 and QR codes. Ensures instant offline product identification.
              </Text>
            )}
          </View>

        </View>
      </CameraView>
    </View>
  );
}
