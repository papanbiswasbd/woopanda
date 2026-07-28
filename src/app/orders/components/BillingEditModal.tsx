import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';

interface BillingEditModalProps {
  visible: boolean;
  onClose: () => void;
  billingData: any;
  onSave: (updatedBilling: any) => Promise<void>;
}

export default function BillingEditModal({ visible, onClose, billingData, onSave }: BillingEditModalProps) {
  const [formData, setFormData] = useState(billingData || {});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setFormData(billingData || {});
    }
  }, [visible]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(formData);
    setIsSaving(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-1 justify-end">
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} onPress={onClose} />
          <View className="bg-white rounded-t-3xl h-[85%]">
            <View className="flex-row justify-between items-center p-5 border-b border-slate-100">
              <Text className="text-xl font-black text-slate-900">Edit Customer Profile</Text>
              <Pressable onPress={onClose} className="p-2 bg-slate-100 rounded-full active:opacity-50">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <Text className="text-slate-900 font-bold mb-3 text-lg">Contact Info</Text>
              
              <View className="flex-row gap-3">
                <View className="flex-1 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">First Name</Text>
                  <TextInput
                    value={formData?.first_name || ''}
                    onChangeText={(val) => handleChange('first_name', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="First Name"
                  />
                </View>
                <View className="flex-1 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Last Name</Text>
                  <TextInput
                    value={formData?.last_name || ''}
                    onChangeText={(val) => handleChange('last_name', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="Last Name"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Email</Text>
                <TextInput
                  value={formData?.email || ''}
                  onChangeText={(val) => handleChange('email', val)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                  placeholder="Email Address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View className="mb-6">
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Phone</Text>
                <TextInput
                  value={formData?.phone || ''}
                  onChangeText={(val) => handleChange('phone', val)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                  placeholder="Phone Number"
                  keyboardType="phone-pad"
                />
              </View>

              <Text className="text-slate-900 font-bold mb-3 text-lg">Billing Address</Text>
              
              <View className="mb-4">
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Address Line 1</Text>
                <TextInput
                  value={formData?.address_1 || ''}
                  onChangeText={(val) => handleChange('address_1', val)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                  placeholder="Street Address"
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Address Line 2 (Optional)</Text>
                <TextInput
                  value={formData?.address_2 || ''}
                  onChangeText={(val) => handleChange('address_2', val)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                  placeholder="Apt, Suite, Unit, etc."
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">City</Text>
                  <TextInput
                    value={formData?.city || ''}
                    onChangeText={(val) => handleChange('city', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="City"
                  />
                </View>
                <View className="w-1/3 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Postcode</Text>
                  <TextInput
                    value={formData?.postcode || ''}
                    onChangeText={(val) => handleChange('postcode', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="Zip/Postal"
                  />
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">State/County</Text>
                  <TextInput
                    value={formData?.state || ''}
                    onChangeText={(val) => handleChange('state', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="State Code"
                  />
                </View>
                <View className="flex-1 mb-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">Country</Text>
                  <TextInput
                    value={formData?.country || ''}
                    onChangeText={(val) => handleChange('country', val)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 h-12 text-slate-900 text-sm font-medium"
                    placeholder="Country Code"
                  />
                </View>
              </View>
            </ScrollView>

            <View className="p-5 border-t border-slate-100 bg-white">
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`h-14 rounded-2xl items-center justify-center ${isSaving ? 'bg-blue-400' : 'bg-blue-600'} active:opacity-80`}
              >
                {isSaving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base uppercase tracking-wider">Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
