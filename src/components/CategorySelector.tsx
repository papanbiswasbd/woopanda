import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList, Alert } from 'react-native';
import { Search, Check, X, Plus } from 'lucide-react-native';
import { db, sqlite } from '../shared/database/db';
import { categories } from '../shared/database/schema';
import { syncQueueService } from '../shared/services/syncQueueService';

interface Category {
  id?: number;
  name: string;
  slug?: string;
}

interface Props {
  selectedCategories: Category[];
  onChange: (categories: Category[]) => void;
}

export default function CategorySelector({ selectedCategories, onChange }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  const loadCategories = useCallback(() => {
    try {
      const rows = sqlite.getAllSync<Category>(
        `SELECT id, name, slug FROM categories ORDER BY name ASC`
      );
      setAllCategories(rows);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (modalVisible) {
      loadCategories();
    }
  }, [modalVisible, loadCategories]);

  const toggleCategory = (cat: Category) => {
    const exists = selectedCategories.find(c => c.name === cat.name);
    if (exists) {
      onChange(selectedCategories.filter(c => c.name !== cat.name));
    } else {
      onChange([...selectedCategories, { id: cat.id, name: cat.name, slug: cat.slug }]);
    }
  };

  const createCategory = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    
    // Optimistic creation
    const tempId = -1 * Math.floor(Date.now());
    const newCat = { id: tempId, name: trimmed, slug: trimmed.toLowerCase().replace(/\s+/g, '-') };
    
    try {
      await db.insert(categories).values({
        id: tempId,
        name: trimmed,
        slug: newCat.slug,
        count: 0,
        lastUpdated: Date.now()
      });
      
      // Enqueue sync action
      await syncQueueService.enqueue('CREATE_CATEGORY', { name: trimmed });
      syncQueueService.processQueue().catch(() => {});
      
      setAllCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      toggleCategory(newCat);
      setSearchQuery('');
    } catch (e) {
      console.error('Failed to create category', e);
      Alert.alert('Error', 'Failed to create category locally');
    }
  };

  const filteredCategories = allCategories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const exactMatch = allCategories.find(c => c.name.toLowerCase() === searchQuery.toLowerCase().trim());

  return (
    <View>
      <Pressable 
        onPress={() => setModalVisible(true)}
        className="bg-slate-50 border border-slate-200 rounded-xl min-h-[44px] px-3 py-2 justify-center"
      >
        {selectedCategories.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {selectedCategories.map((c, i) => (
              <View key={i} className="bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded flex-row items-center gap-1">
                <Text className="text-blue-600 text-[10px] font-bold">{c.name}</Text>
                <Pressable onPress={() => toggleCategory(c)} hitSlop={8} className="ml-1">
                  <X size={12} color="#2563EB" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-slate-500 text-sm">Select categories...</Text>
        )}
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 bg-slate-50 pt-4">
          <View className="flex-row items-center justify-between p-4 bg-white border-b border-slate-200">
            <Text className="text-slate-900 font-bold text-base">Categories</Text>
            <Pressable onPress={() => setModalVisible(false)} className="p-2 -mr-2 active:opacity-50">
              <Text className="text-blue-500 font-semibold text-sm">Done</Text>
            </Pressable>
          </View>

          <View className="p-4 bg-white border-b border-slate-200">
            <View className="flex-row items-center bg-slate-100 rounded-lg h-10 px-3">
              <Search size={16} color="#64748B" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search or add new category..."
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                className="flex-1 ml-2 text-sm text-slate-900 h-full"
              />
            </View>
          </View>

          <FlatList
            data={filteredCategories}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            renderItem={({ item }) => {
              const isSelected = selectedCategories.some(c => c.name === item.name);
              return (
                <Pressable
                  onPress={() => toggleCategory(item)}
                  className={`flex-row items-center justify-between p-3 mb-2 rounded-xl border ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`font-semibold text-sm ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                    {item.name}
                  </Text>
                  {isSelected && <Check size={16} color="#1D4ED8" />}
                </Pressable>
              );
            }}
            ListEmptyComponent={() => (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm mb-4">No categories found matching "{searchQuery}"</Text>
                {searchQuery.trim().length > 0 && !exactMatch && (
                  <Pressable 
                    onPress={createCategory}
                    className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2"
                  >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-bold text-sm">Create "{searchQuery.trim()}"</Text>
                  </Pressable>
                )}
              </View>
            )}
            ListFooterComponent={() => (
              searchQuery.trim().length > 0 && !exactMatch && filteredCategories.length > 0 ? (
                <Pressable 
                  onPress={createCategory}
                  className="bg-blue-50 border border-blue-200 border-dashed rounded-xl p-4 mt-2 items-center flex-row justify-center gap-2"
                >
                  <Plus size={16} color="#2563EB" />
                  <Text className="text-blue-600 font-bold text-sm">Create "{searchQuery.trim()}"</Text>
                </Pressable>
              ) : null
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
