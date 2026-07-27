import { db, sqlite } from '../database/db';
import { syncQueue, products, orders, reviews, coupons, categories } from '../database/schema';
import { eq, asc } from 'drizzle-orm';
import { apiClient, ApiError } from './api/client';
import NetInfo from '@react-native-community/netinfo';

export const syncQueueService = {
  async enqueue(action: string, payload: any): Promise<void> {
    try {
      await db.insert(syncQueue).values({
        action,
        payload: JSON.stringify(payload),
        status: 'pending',
        attempts: 0,
        createdAt: Date.now(),
      });
      console.log(`Enqueued offline sync task: ${action}`);
    } catch (error) {
      console.error('Failed to enqueue sync task:', error);
    }
  },

  async getPendingCount(): Promise<number> {
    try {
      const result = sqlite.getAllSync<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE status = "pending"');
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  },

  async processQueue(): Promise<void> {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('Skipping offline sync queue process: No internet connection');
      return;
    }

    // Get all pending sync items
    const items = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'))
      .orderBy(asc(syncQueue.id));

    if (items.length === 0) {
      return;
    }

    console.log(`Processing offline sync queue: ${items.length} items found`);

    for (const item of items) {
      const payload = JSON.parse(item.payload);
      let success = false;
      let shouldDelete = false;
      let errorMessage = '';

      // Update status to processing
      await db
        .update(syncQueue)
        .set({ status: 'processing' })
        .where(eq(syncQueue.id, item.id));

      try {
        switch (item.action) {
          case 'CREATE_PRODUCT': {
            const result: any = await apiClient.post('products', payload);
            const barcodeMeta = result.meta_data?.find((m: any) => m.key === '_barcode');
            const barcodeVal = barcodeMeta ? String(barcodeMeta.value) : (result.sku || '');

            const productData = {
              id: result.id,
              name: result.name,
              slug: result.slug,
              permalink: result.permalink,
              type: result.type,
              status: result.status,
              description: result.description,
              shortDescription: result.short_description,
              price: result.price,
              regularPrice: result.regular_price,
              salePrice: result.sale_price,
              onSale: result.on_sale,
              purchasable: result.purchasable,
              manageStock: result.manage_stock,
              stockQuantity: result.stock_quantity,
              stockStatus: result.stock_status,
              sku: result.sku,
              barcode: barcodeVal,
              images: JSON.stringify(result.images || []),
              categories: JSON.stringify(result.categories || []),
              attributes: JSON.stringify(result.attributes || []),
              lastUpdated: Date.now(),
              menuOrder: result.menu_order || 0,
              virtual: result.virtual,
              downloadable: result.downloadable,
              weight: result.weight,
              length: result.dimensions?.length || '',
              width: result.dimensions?.width || '',
              height: result.dimensions?.height || '',
              backorders: result.backorders,
              soldIndividually: result.sold_individually,
              reviewsAllowed: result.reviews_allowed,
              purchaseNote: result.purchase_note,
            };

            // Save to local products cache
            await db.insert(products).values(productData).onConflictDoUpdate({
              target: products.id,
              set: productData,
            });
            success = true;
            shouldDelete = true;
            break;
          }

          case 'CREATE_CATEGORY': {
            const result: any = await apiClient.post('products/categories', payload);
            const categoryData = {
              id: result.id,
              name: result.name,
              slug: result.slug || '',
              count: result.count || 0,
              lastUpdated: Date.now(),
            };
            await db.insert(categories).values(categoryData).onConflictDoUpdate({
              target: categories.id,
              set: categoryData,
            });
            success = true;
            shouldDelete = true;
            break;
          }

          case 'UPDATE_PRODUCT': {
            const { id, ...data } = payload;
            const result: any = await apiClient.put(`products/${id}`, data);
            const barcodeMeta = result.meta_data?.find((m: any) => m.key === '_barcode');
            const barcodeVal = barcodeMeta ? String(barcodeMeta.value) : (result.sku || '');

            const productData = {
              name: result.name,
              slug: result.slug,
              permalink: result.permalink,
              type: result.type,
              status: result.status,
              description: result.description,
              shortDescription: result.short_description,
              price: result.price,
              regularPrice: result.regular_price,
              salePrice: result.sale_price,
              onSale: result.on_sale,
              purchasable: result.purchasable,
              manageStock: result.manage_stock,
              stockQuantity: result.stock_quantity,
              stockStatus: result.stock_status,
              sku: result.sku,
              barcode: barcodeVal,
              images: JSON.stringify(result.images || []),
              categories: JSON.stringify(result.categories || []),
              attributes: JSON.stringify(result.attributes || []),
              lastUpdated: Date.now(),
              menuOrder: result.menu_order || 0,
              virtual: result.virtual,
              downloadable: result.downloadable,
              weight: result.weight,
              length: result.dimensions?.length || '',
              width: result.dimensions?.width || '',
              height: result.dimensions?.height || '',
              backorders: result.backorders,
              soldIndividually: result.sold_individually,
              reviewsAllowed: result.reviews_allowed,
              purchaseNote: result.purchase_note,
            };

            // Update local products cache
            await db.update(products)
              .set(productData)
              .where(eq(products.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'DELETE_PRODUCT': {
            const { id } = payload;
            await apiClient.delete(`products/${id}?force=true`);
            // Delete local product cache
            await db.delete(products).where(eq(products.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'UPDATE_ORDER': {
            const { id, ...data } = payload;
            const result: any = await apiClient.put(`orders/${id}`, data);
            // Update local order cache
            await db.update(orders)
              .set({
                status: result.status,
                total: result.total,
                billing: JSON.stringify(result.billing),
                shipping: JSON.stringify(result.shipping),
                lineItems: JSON.stringify(result.line_items),
                notes: JSON.stringify(result.notes || []),
                lastUpdated: Date.now(),
              })
              .where(eq(orders.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'CREATE_COUPON': {
            const result: any = await apiClient.post('coupons', payload);
            await db.insert(coupons).values({
              ...result,
              lastUpdated: Date.now(),
            });
            success = true;
            shouldDelete = true;
            break;
          }

          case 'UPDATE_COUPON': {
            const { id, ...data } = payload;
            const result: any = await apiClient.put(`coupons/${id}`, data);
            await db.update(coupons)
              .set({
                code: result.code,
                amount: result.amount,
                discountType: result.discount_type,
                description: result.description,
                usageCount: result.usage_count,
                lastUpdated: Date.now(),
              })
              .where(eq(coupons.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'DELETE_COUPON': {
            const { id } = payload;
            await apiClient.delete(`coupons/${id}?force=true`);
            await db.delete(coupons).where(eq(coupons.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'UPDATE_REVIEW': {
            const { id, ...data } = payload;
            const result: any = await apiClient.put(`products/reviews/${id}`, data);
            await db.update(reviews)
              .set({
                status: result.status,
              })
              .where(eq(reviews.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          case 'DELETE_REVIEW': {
            const { id } = payload;
            await apiClient.delete(`products/reviews/${id}?force=true`);
            await db.delete(reviews).where(eq(reviews.id, id));
            success = true;
            shouldDelete = true;
            break;
          }

          default:
            console.warn(`Unknown sync action: ${item.action}`);
            shouldDelete = true; // Remove unknown items to avoid infinite blockages
            break;
        }
      } catch (error: any) {
        console.error(`Sync error on task ${item.id} (${item.action}):`, error);
        errorMessage = error.message || 'Unknown error';

        if (error instanceof ApiError) {
          // If the error is a bad request (400, 403, 404, etc.), it means the payload is invalid.
          // Don't retry these forever. Flag them as permanently failed.
          if (error.status >= 400 && error.status < 500) {
            shouldDelete = false; // Keep in queue for debugging but mark as failed
            success = false;
          } else {
            // A server error (500, 502, 503, 504) or network timeout. We should pause and retry later.
            await db
              .update(syncQueue)
              .set({
                status: 'pending',
                attempts: (item.attempts || 0) + 1,
                error: errorMessage,
              })
              .where(eq(syncQueue.id, item.id));
            return; // Exit processQueue early, network/server is struggling
          }
        } else {
          // General connection error (TypeError: Network request failed). Stop queue processing and retry later.
          await db
            .update(syncQueue)
            .set({
              status: 'pending',
              attempts: (item.attempts || 0) + 1,
              error: errorMessage,
            })
            .where(eq(syncQueue.id, item.id));
          return; // Exit, connection is unstable
        }
      }

      if (shouldDelete && success) {
        await db.delete(syncQueue).where(eq(syncQueue.id, item.id));
      } else {
        // Mark as failed permanently if not deleted but failed validation
        await db
          .update(syncQueue)
          .set({
            status: 'failed',
            attempts: (item.attempts || 0) + 1,
            error: errorMessage,
          })
          .where(eq(syncQueue.id, item.id));
      }
    }
  },
};
