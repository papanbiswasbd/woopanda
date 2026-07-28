import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { X, Tag, Percent, DollarSign } from 'lucide-react-native';

interface DiscountEditModalProps {
  visible: boolean;
  onClose: () => void;
  currency: string;
  onSave: (feeName: string, feeTotal: string) => Promise<void>;
}

export default function DiscountEditModal({ visible, onClose, currency, onSave }: DiscountEditModalProps) {
  const [feeName, setFeeName] = useState('Manual Discount');
  const [feeAmount, setFeeAmount] = useState('');
  const [isDiscount, setIsDiscount] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!feeAmount.trim()) return;
    setIsSaving(true);
    
    // If it's a discount, the amount should be negative
    const numericAmount = Math.abs(Number(feeAmount));
    const finalAmountStr = (isDiscount ? -numericAmount : numericAmount).toFixed(2);
    
    await onSave(feeName, finalAmountStr);
    
    setIsSaving(false);
    setFeeAmount(''); // reset for next time
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-1 justify-center p-5 bg-slate-900/50">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={onClose} />
          
          <View className="bg-white rounded-3xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center">
                  <Tag size={20} color="#3B82F6" />
                </View>
                <Text className="text-xl font-black text-slate-900">Add Fee / Discount</Text>
              </View>
              <Pressable onPress={onClose} className="p-2 bg-slate-100 rounded-full active:opacity-50">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <View className="flex-row bg-slate-100 p-1 rounded-xl mb-5">
              <Pressable 
                onPress={() => setIsDiscount(true)} 
                className={`flex-1 py-2.5 rounded-lg items-center ${isDiscount ? 'bg-white shadow-sm' : 'opacity-60'}`}
              >
                <Text className={`font-bold text-sm ${isDiscount ? 'text-slate-900' : 'text-slate-500'}`}>Discount (-)</Text>
              </Pressable>
              <Pressable 
                onPress={() => setIsDiscount(false)} 
                className={`flex-1 py-2.5 rounded-lg items-center ${!isDiscount ? 'bg-white shadow-sm' : 'opacity-60'}`}
              >
                <Text className={`font-bold text-sm ${!isDiscount ? 'text-slate-900' : 'text-slate-500'}`}>Fee (+)</Text>
              </Pressable>
            </View>

            <View className="mb-4">
              <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Description</Text>
              <TextInput
                value={feeName}
                onChangeText={setFeeName}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                placeholder="e.g. Apology Discount, Gift Wrapping Fee"
              />
            </View>

            <View className="mb-6">
              <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Amount (Flat)</Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                <Text className="text-slate-400 font-black mr-2">{isDiscount ? '-' : '+'}</Text>
                <TextInput
                  value={feeAmount}
                  onChangeText={setFeeAmount}
                  keyboardType="decimal-pad"
                  className="flex-1 text-slate-900 text-base font-bold h-full"
                  placeholder="0.00"
                />
              </View>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={isSaving || !feeAmount.trim()}
              className={`h-14 rounded-2xl items-center justify-center ${isSaving || !feeAmount.trim() ? 'bg-blue-400' : 'bg-blue-600'} active:opacity-80`}
            >
              {isSaving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base uppercase tracking-wider">Apply {isDiscount ? 'Discount' : 'Fee'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
