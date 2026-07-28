import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { X, Minus, Plus } from 'lucide-react-native';
import { Image } from 'expo-image';
import { getCurrencySymbol } from '../../../shared/store/settingsStore';

interface LineItemsEditModalProps {
  visible: boolean;
  onClose: () => void;
  lineItems: any[];
  currency: string;
  onSave: (updatedItems: any[]) => Promise<void>;
}

export default function LineItemsEditModal({ visible, onClose, lineItems, currency, onSave }: LineItemsEditModalProps) {
  const [items, setItems] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      // Create a deep copy so we can mutate safely
      setItems(JSON.parse(JSON.stringify(lineItems || [])));
    }
  }, [visible]);

  const updateQuantity = (index: number, change: number) => {
    setItems((prev) => {
      const newItems = [...prev];
      const newQty = Math.max(0, newItems[index].quantity + change);
      newItems[index].quantity = newQty;
      // Recalculate subtotal based on current unit price (which is item.price)
      const currentPrice = Number(newItems[index].price || 0);
      newItems[index].subtotal = (currentPrice * newQty).toFixed(2);
      newItems[index].total = newItems[index].subtotal;
      return newItems;
    });
  };

  const updatePrice = (index: number, newPriceStr: string) => {
    setItems((prev) => {
      const newItems = [...prev];
      newItems[index].price = newPriceStr;
      const parsedPrice = Number(newPriceStr) || 0;
      newItems[index].subtotal = (parsedPrice * newItems[index].quantity).toFixed(2);
      newItems[index].total = newItems[index].subtotal;
      return newItems;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    // WooCommerce allows deleting a line item by omitting it from the PUT request?
    // Actually passing quantity: 0 works or sending it via specific endpoints.
    // For safety, we will just send the updated items to the main save handler.
    await onSave(items);
    setIsSaving(false);
  };

  const currentTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-1 justify-end">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} onPress={onClose} />
          <View className="bg-white rounded-t-3xl h-[85%]">
            <View className="flex-row justify-between items-center p-5 border-b border-slate-100">
              <Text className="text-xl font-black text-slate-900">Edit Order Items</Text>
              <Pressable onPress={onClose} className="p-2 bg-slate-100 rounded-full active:opacity-50">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
              <Text className="text-slate-500 text-sm mb-4">Modify quantities or override unit prices. Items with 0 quantity will be removed from the order total.</Text>
              
              {items.map((item, index) => (
                <View key={item.id || index} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
                  <View className="flex-row gap-3 mb-4">
                    <View className="w-16 h-16 bg-white rounded-xl border border-slate-200 overflow-hidden items-center justify-center">
                      {item.image?.src ? (
                        <Image source={{ uri: item.image.src }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <Text className="text-slate-300 font-bold text-xs">No Img</Text>
                      )}
                    </View>
                    <View className="flex-1 justify-center">
                      <Text className="font-bold text-slate-900 text-sm mb-1" numberOfLines={2}>{item.name}</Text>
                      <Text className="text-slate-500 text-xs">SKU: {item.sku || 'N/A'}</Text>
                    </View>
                  </View>
                  
                  <View className="flex-row items-end gap-3">
                    {/* Price Input */}
                    <View className="flex-1">
                      <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Unit Price ({getCurrencySymbol(currency)})</Text>
                      <TextInput
                        value={String(item.price)}
                        onChangeText={(val) => updatePrice(index, val)}
                        keyboardType="decimal-pad"
                        className="bg-white border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-bold"
                      />
                    </View>
                    
                    {/* Quantity Stepper */}
                    <View className="flex-1 items-end">
                      <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Quantity</Text>
                      <View className="flex-row items-center bg-white border border-slate-200 rounded-xl h-12">
                        <Pressable onPress={() => updateQuantity(index, -1)} className="w-12 h-full items-center justify-center border-r border-slate-200 active:bg-slate-50 rounded-l-xl">
                          <Minus size={16} color="#64748B" />
                        </Pressable>
                        <Text className="flex-1 text-center font-black text-slate-900 text-base">{item.quantity}</Text>
                        <Pressable onPress={() => updateQuantity(index, 1)} className="w-12 h-full items-center justify-center border-l border-slate-200 active:bg-slate-50 rounded-r-xl">
                          <Plus size={16} color="#64748B" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  
                  <View className="flex-row justify-between items-center mt-4 pt-3 border-t border-slate-200/60">
                    <Text className="text-slate-500 font-bold text-xs">Item Subtotal:</Text>
                    <Text className="text-blue-600 font-black text-sm">
                      {getCurrencySymbol(currency)}{Number(item.total).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View className="p-5 border-t border-slate-100 bg-white">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-slate-600 font-bold text-sm uppercase tracking-wider">New Items Total:</Text>
                <Text className="text-slate-900 font-black text-xl">{getCurrencySymbol(currency)}{currentTotal.toFixed(2)}</Text>
              </View>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`h-14 rounded-2xl items-center justify-center ${isSaving ? 'bg-blue-400' : 'bg-blue-600'} active:opacity-80`}
              >
                {isSaving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base uppercase tracking-wider">Save Item Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
