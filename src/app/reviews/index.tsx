import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { db, sqlite } from '../../shared/database/db';
import { reviews } from '../../shared/database/schema';
import { eq } from 'drizzle-orm';
import { syncQueueService } from '../../shared/services/syncQueueService';
import { syncService } from '../../shared/services/syncService';
import { Star, Check, ShieldAlert, Trash2, MessageSquare, AlertCircle } from 'lucide-react-native';

export default function ReviewsScreen() {
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load cached reviews from SQLite
  const loadReviews = useCallback(() => {
    try {
      const rows = sqlite.getAllSync<any>(
        `SELECT id, product_id as productId, status, reviewer, reviewer_email as reviewerEmail, review, rating, date_created as dateCreated 
         FROM reviews 
         ORDER BY id DESC`
      );
      const parsed = rows.map((r: any) => ({
        id: r.id,
        productId: r.productId,
        status: r.status,
        reviewer: r.reviewer,
        reviewerEmail: r.reviewerEmail,
        review: r.review ? r.review.replace(/<[^>]*>/g, '') : '', // strip HTML tags
        rating: r.rating || 5,
        dateCreated: r.dateCreated,
      }));
      setReviewsList(parsed);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncService.syncReviews();
    loadReviews();
    setRefreshing(false);
  };

  // Moderate review status (Optimistic + Offline Queue)
  const handleModerate = async (review: any, nextStatus: string) => {
    try {
      if (nextStatus === 'trash') {
        // Delete locally
        await db.delete(reviews).where(eq(reviews.id, review.id));
        // Queue API delete
        await syncQueueService.enqueue('DELETE_REVIEW', { id: review.id });
        setReviewsList(prev => prev.filter(r => r.id !== review.id));
      } else {
        // Update locally
        sqlite.runSync(
          `UPDATE reviews SET status = ? WHERE id = ?`,
          nextStatus, review.id
        );
        // Queue API status update
        await syncQueueService.enqueue('UPDATE_REVIEW', {
          id: review.id,
          status: nextStatus,
        });
        setReviewsList(prev => prev.map(r => {
          if (r.id === review.id) {
            return { ...r, status: nextStatus };
          }
          return r;
        }));
      }

      // Flush sync queue
      syncQueueService.processQueue().catch(() => {});

      Alert.alert('Moderated', `Review marked as "${nextStatus}" successfully.`);
    } catch (error) {
      console.error('Failed to moderate review:', error);
      Alert.alert('Error', 'Could not save review action.');
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star 
          key={i} 
          size={12} 
          fill={i <= rating ? '#F59E0B' : 'transparent'} 
          color={i <= rating ? '#F59E0B' : '#475569'} 
          className="mr-0.5"
        />
      );
    }
    return <View className="flex-row">{stars}</View>;
  };

  return (
    <View className="flex-1 bg-slate-50 px-5 pt-4">
      
      {/* Reviews list */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : reviewsList.length === 0 ? (
        <View className="flex-1 justify-center items-center py-10">
          <MessageSquare size={48} color="#475569" />
          <Text className="text-slate-600 font-bold text-base mt-4">No reviews recorded</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center px-6">
            Swipe down to pull customer reviews from WooCommerce.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviewsList}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3.5">
              
              {/* Header Profile row */}
              <View className="flex-row justify-between items-start mb-2.5">
                <View className="flex-1 pr-4">
                  <Text className="text-slate-900 font-bold text-xs" numberOfLines={1}>
                    {item.reviewer}
                  </Text>
                  <Text className="text-slate-500 text-[10px] mt-0.5" numberOfLines={1}>
                    {item.reviewerEmail}
                  </Text>
                </View>
                {renderStars(item.rating)}
              </View>

              {/* Review Text content */}
              <Text className="text-slate-700 text-xs leading-normal mb-3.5">
                "{item.review}"
              </Text>

              {/* Footer controls & Status indicators */}
              <View className="flex-row justify-between items-center border-t border-slate-200 pt-3">
                <View className={`px-2 py-0.5 rounded-full ${
                  item.status === 'approved' ? 'bg-emerald-500/10' :
                  item.status === 'spam' ? 'bg-amber-500/10' : 'bg-slate-100'
                }`}>
                  <Text className={`text-[8px] font-extrabold uppercase ${
                    item.status === 'approved' ? 'text-emerald-400' :
                    item.status === 'spam' ? 'text-amber-400' : 'text-slate-600'
                  }`}>
                    {item.status}
                  </Text>
                </View>

                {/* Moderation Controls */}
                <View className="flex-row gap-2">
                  {item.status !== 'approved' && (
                    <Pressable
                      onPress={() => handleModerate(item, 'approved')}
                      className="h-8 px-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg items-center justify-center flex-row gap-1 active:bg-emerald-500/20"
                    >
                      <Check size={12} color="#10B981" />
                      <Text className="text-emerald-400 font-bold text-[10px]">Approve</Text>
                    </Pressable>
                  )}

                  {item.status !== 'spam' && (
                    <Pressable
                      onPress={() => handleModerate(item, 'spam')}
                      className="h-8 px-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg items-center justify-center flex-row gap-1 active:bg-amber-500/20"
                    >
                      <ShieldAlert size={12} color="#F59E0B" />
                      <Text className="text-amber-400 font-bold text-[10px]">Spam</Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => handleModerate(item, 'trash')}
                    className="h-8 w-8 bg-red-500/10 border border-red-500/20 rounded-lg items-center justify-center active:bg-red-500/20"
                  >
                    <Trash2 size={12} color="#EF4444" />
                  </Pressable>
                </View>
              </View>

            </View>
          )}
        />
      )}

    </View>
  );
}
