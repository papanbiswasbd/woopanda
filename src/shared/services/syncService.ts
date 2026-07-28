import { db, sqlite } from '../database/db';
import { products, orders, customers, reviews, coupons, syncMetadata, categories } from '../database/schema';
import { eq } from 'drizzle-orm';
import { apiClient } from './api/client';
import { syncQueueService } from './syncQueueService';
import { getCurrencySymbol, useSettingsStore } from '../store/settingsStore';
import * as Notifications from 'expo-notifications';

export const syncService = {
  async getSyncTimestamp(key: string): Promise<string | null> {
    try {
      const result = await db
        .select()
        .from(syncMetadata)
        .where(eq(syncMetadata.key, key))
        .limit(1);
      return result.length > 0 ? result[0].value : null;
    } catch {
      return null;
    }
  },

  async updateSyncTimestamp(key: string, value: string): Promise<void> {
    try {
      await db.insert(syncMetadata).values({
        key,
        value,
      }).onConflictDoUpdate({
        target: syncMetadata.key,
        set: { value },
      });
    } catch (error) {
      console.error(`Failed to update sync timestamp for ${key}:`, error);
    }
  },

  async loadCachedSettings(): Promise<void> {
    try {
      const cachedStatuses = await this.getSyncTimestamp('order_statuses');
      if (cachedStatuses) {
        useSettingsStore.getState().setOrderStatuses(JSON.parse(cachedStatuses));
      }
    } catch (e) {
      console.error('Failed to load cached settings:', e);
    }
  },

  async syncAll(): Promise<void> {
    console.log('Starting full background sync...');
    try {
      // First process the offline sync queue
      await syncQueueService.processQueue();

      // Check if we need to do a one-time full backfill for orders
      const hasDoneFullSync = await this.getSyncTimestamp('v2_order_full_sync_completed');
      const needsFullSync = !hasDoneFullSync;

      // Run fetches in parallel
      await Promise.allSettled([
        this.syncStoreCurrency(),
        this.syncProducts(),
        this.syncCategories(),
        this.syncOrders(needsFullSync),
        this.syncCustomers(),
        this.syncCoupons(),
        this.syncReviews(),
      ]);

      if (needsFullSync) {
        await this.updateSyncTimestamp('v2_order_full_sync_completed', 'true');
        console.log('Completed automatic one-time full order backfill.');
      }

      // Run this after orders sync to ensure new statuses are picked up
      await this.syncOrderStatuses();

      console.log('Full synchronization completed.');
    } catch (error) {
      console.error('Error during full synchronization:', error);
    }
  },

  async syncProducts(): Promise<void> {
    try {
      const lastSync = await this.getSyncTimestamp('products_last_sync');
      let endpoint = 'products?per_page=100';
      if (lastSync) {
        // Fetch only modified products since last sync
        endpoint += `&modified_after=${encodeURIComponent(lastSync)}`;
      }

      const remoteProducts: any[] = await apiClient.get(endpoint);
      if (remoteProducts && remoteProducts.length > 0) {
        for (const item of remoteProducts) {
          const barcodeMeta = item.meta_data?.find((m: any) => m.key === '_barcode');
          const barcodeVal = barcodeMeta ? String(barcodeMeta.value) : (item.sku || '');

          const productData = {
            id: item.id,
            name: item.name,
            slug: item.slug,
            permalink: item.permalink,
            type: item.type,
            status: item.status,
            description: item.description,
            shortDescription: item.short_description,
            price: item.price,
            regularPrice: item.regular_price,
            salePrice: item.sale_price,
            onSale: item.on_sale,
            purchasable: item.purchasable,
            manageStock: item.manage_stock,
            stockQuantity: item.stock_quantity,
            stockStatus: item.stock_status,
            sku: item.sku,
            barcode: barcodeVal,
            images: JSON.stringify(item.images),
            categories: JSON.stringify(item.categories),
            attributes: JSON.stringify(item.attributes),
            lastUpdated: Date.now(),
            menuOrder: item.menu_order || 0,
            virtual: item.virtual,
            downloadable: item.downloadable,
            weight: item.weight,
            length: item.dimensions?.length || '',
            width: item.dimensions?.width || '',
            height: item.dimensions?.height || '',
            backorders: item.backorders,
            soldIndividually: item.sold_individually,
            reviewsAllowed: item.reviews_allowed,
            purchaseNote: item.purchase_note,
          };

          await db.insert(products).values(productData).onConflictDoUpdate({
            target: products.id,
            set: productData,
          });
        }
      }

      // Update timestamp to current date in ISO format
      await this.updateSyncTimestamp('products_last_sync', new Date().toISOString());
      console.log(`Synced ${remoteProducts.length} products`);
    } catch (error) {
      console.error('Failed to sync products:', error);
    }
  },

  async syncOrders(forceAll: boolean = false): Promise<void> {
    try {
      const lastSyncStr = await this.getSyncTimestamp('orders_last_sync');
      const lastSyncTime = lastSyncStr ? new Date(lastSyncStr).getTime() : 0;
      
      let page = 1;
      let totalSynced = 0;
      let hasMore = true;
      let consecutiveErrors = 0;
      
      console.log('Fetching orders from WooCommerce...');

      while (hasMore) {
        try {
          // Explicitly use status=any to ensure custom statuses are included
          let endpoint = `orders?per_page=50&page=${page}&status=any&_t=${Date.now()}`;
          
          // If this is a delta sync, we fetch the most recently modified orders.
          // We avoid using modified_after because some WC environments ignore it.
          if (!forceAll) {
            endpoint += `&orderby=modified&order=desc`;
          }

          const remoteOrders: any[] = await apiClient.get(endpoint, { timeout: 30000 });
          consecutiveErrors = 0; // reset on success
          
          if (remoteOrders && remoteOrders.length > 0) {
            let reachedOldOrders = false;
            
            for (const item of remoteOrders) {
              // Delta sync check: if order is older than our last sync (minus 5 mins for clock skew), mark that we reached old orders
              if (!forceAll && lastSyncTime > 0) {
                const gmtStr = item.date_modified_gmt || item.date_created_gmt;
                // Append 'Z' to ensure JS parses the GMT string correctly as UTC, avoiding local timezone skew bugs!
                const itemModifiedTime = gmtStr ? new Date(gmtStr + 'Z').getTime() : new Date(item.date_modified || item.date_created).getTime();
                
                if (itemModifiedTime < lastSyncTime - 5 * 60000) {
                  reachedOldOrders = true;
                  // We deliberately DO NOT 'continue;' here. We want to upsert everything on the current page
                  // to guarantee that no orders are missed due to previous sync failures or gaps.
                }
              }

              const orderData = {
                id: item.id,
                number: item.number,
                status: item.status,
                currency: item.currency,
                dateCreated: item.date_created,
                dateModified: item.date_modified,
                discountTotal: item.discount_total,
                shippingTotal: item.shipping_total,
                total: item.total,
                customerId: item.customer_id,
                billing: JSON.stringify(item.billing),
                shipping: JSON.stringify(item.shipping),
                paymentMethod: item.payment_method,
                paymentMethodTitle: item.payment_method_title,
                transactionId: item.transaction_id,
                lineItems: JSON.stringify(item.line_items),
                notes: JSON.stringify(item.coupon_lines || []), // Temporary notes field mapping
                lastUpdated: Date.now(),
              };
              
              let isNewOrder = false;

              // If background polling (!forceAll), check if this is a brand new order so we can notify the user
              if (!forceAll) {
                const existing = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, item.id)).limit(1);
                if (existing.length === 0) {
                  isNewOrder = true;
                }
              }

              await db.insert(orders).values(orderData).onConflictDoUpdate({
                target: orders.id,
                set: orderData,
              });
              
              if (isNewOrder) {
                try {
                  const customerName = `${item.billing?.first_name || ''} ${item.billing?.last_name || ''}`.trim() || 'Guest Customer';
                  let quantity = 0;
                  let image = undefined;
                  
                  if (item.line_items && Array.isArray(item.line_items)) {
                    for (const li of item.line_items) {
                      quantity += (li.quantity || 1);
                      if (!image && li.image && li.image.src) {
                        image = li.image.src;
                      }
                    }
                  }
                  
                  useSettingsStore.getState().showNewOrderNotification({
                    id: item.id,
                    number: item.number,
                    customerName,
                    total: item.total,
                    currency: item.currency,
                    quantity,
                    image,
                  });
                  
                  // Trigger OS Push Notification
                  const currencySymbol = getCurrencySymbol(item.currency);
                  Notifications.scheduleNotificationAsync({
                    content: {
                      title: `New Order #${item.number}! 🎉`,
                      body: `${customerName} just placed an order for ${quantity} items totaling ${currencySymbol}${item.total}.`,
                      sound: true,
                      data: { orderId: item.id, url: `/orders/${item.id}` },
                    },
                    trigger: null, // show immediately
                  });
                } catch (e) {
                  console.error('Failed to dispatch order notification:', e);
                }
              }
              
              totalSynced++;
            }
            
            // If we reached orders that are older than our last sync, we don't need to fetch more pages
            if (reachedOldOrders) {
              hasMore = false;
            } else if (remoteOrders.length < 50) {
              // If we received fewer than 50 items, we've reached the end
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        } catch (err: any) {
          console.warn(`Failed to fetch orders page ${page}:`, err.message || err);
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            console.warn('Too many consecutive errors, aborting order sync.');
            hasMore = false; // Break loop but still update timestamp for what we DID sync
          } else {
            // Wait 2 seconds before retrying the same page
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      await this.updateSyncTimestamp('orders_last_sync', new Date().toISOString());
      console.log(`Synced ${totalSynced} orders totally`);
      
      if (totalSynced > 0) {
        useSettingsStore.getState().triggerDatabaseUpdate();
      }
    } catch (error: any) {
      console.warn('Failed to sync orders globally:', error.message || error);
    }
  },

  async syncCustomers(): Promise<void> {
    try {
      const lastSync = await this.getSyncTimestamp('customers_last_sync');
      let endpoint = 'customers?per_page=50&role=all';
      // WooCommerce REST API does not directly support modified_after for customers in some versions,
      // but we fetch latest.
      const remoteCustomers: any[] = await apiClient.get(endpoint);
      if (remoteCustomers && remoteCustomers.length > 0) {
        for (const item of remoteCustomers) {
          const customerData = {
            id: item.id,
            email: item.email,
            firstName: item.first_name,
            lastName: item.last_name,
            username: item.username,
            avatarUrl: item.avatar_url,
            billing: JSON.stringify(item.billing),
            shipping: JSON.stringify(item.shipping),
            ordersCount: item.orders_count || 0,
            totalSpent: item.total_spent || '0.00',
            lastUpdated: Date.now(),
          };

          await db.insert(customers).values(customerData).onConflictDoUpdate({
            target: customers.id,
            set: customerData,
          });
        }
      }

      await this.updateSyncTimestamp('customers_last_sync', new Date().toISOString());
      console.log(`Synced ${remoteCustomers.length} customers`);
    } catch (error) {
      console.error('Failed to sync customers:', error);
    }
  },

  async syncCoupons(): Promise<void> {
    try {
      const remoteCoupons: any[] = await apiClient.get('coupons?per_page=100');
      if (remoteCoupons && remoteCoupons.length > 0) {
        for (const item of remoteCoupons) {
          const couponData = {
            id: item.id,
            code: item.code,
            amount: item.amount,
            discountType: item.discount_type,
            description: item.description,
            usageCount: item.usage_count || 0,
            usageLimit: item.usage_limit || null,
            dateExpires: item.date_expires,
            lastUpdated: Date.now(),
          };

          await db.insert(coupons).values(couponData).onConflictDoUpdate({
            target: coupons.id,
            set: couponData,
          });
        }
      }
      console.log(`Synced ${remoteCoupons.length} coupons`);
    } catch (error) {
      console.error('Failed to sync coupons:', error);
    }
  },

  async syncReviews(): Promise<void> {
    try {
      const remoteReviews: any[] = await apiClient.get('products/reviews?per_page=50');
      if (remoteReviews && remoteReviews.length > 0) {
        for (const item of remoteReviews) {
          const reviewData = {
            id: item.id,
            productId: item.product_id,
            status: item.status,
            reviewer: item.reviewer,
            reviewerEmail: item.reviewer_email,
            review: item.review,
            rating: item.rating,
            dateCreated: item.date_created,
          };

          await db.insert(reviews).values(reviewData).onConflictDoUpdate({
            target: reviews.id,
            set: reviewData,
          });
        }
      }
      console.log(`Synced ${remoteReviews.length} product reviews`);
    } catch (error) {
      console.error('Failed to sync reviews:', error);
    }
  },

  async syncStoreCurrency(): Promise<void> {
    try {
      console.log('Fetching WooCommerce store currency setting...');
      // WooCommerce settings/general endpoint
      const response: any[] = await apiClient.get('settings/general');
      if (response && Array.isArray(response)) {
        const currencySetting = response.find(item => item.id === 'woocommerce_currency');
        if (currencySetting && currencySetting.value) {
          const currencyCode = currencySetting.value;
          console.log('Detected store currency setting:', currencyCode);
          useSettingsStore.getState().setCurrency(currencyCode);
          await this.updateSyncTimestamp('store_currency', currencyCode);
          return;
        }
      }
    } catch (err) {
      console.log('Failed to fetch settings/general, falling back to local orders for currency resolution:', err);
    }

    // Fallback: Query SQLite database for order currencies
    try {
      const rows = sqlite.getAllSync<any>(`SELECT currency FROM orders WHERE currency IS NOT NULL LIMIT 50`);
      if (rows && rows.length > 0) {
        // Find most frequent currency
        const counts: Record<string, number> = {};
        let maxCount = 0;
        let mostFrequent = 'USD';
        
        for (const row of rows) {
          counts[row.currency] = (counts[row.currency] || 0) + 1;
          if (counts[row.currency] > maxCount) {
            maxCount = counts[row.currency];
            mostFrequent = row.currency;
          }
        }
        
        console.log('Detected currency from local orders:', mostFrequent);
        useSettingsStore.getState().setCurrency(mostFrequent);
        await this.updateSyncTimestamp('store_currency', mostFrequent);
      }
    } catch (dbError) {
      console.error('Failed to resolve currency from local orders:', dbError);
    }
  },

  async syncOrderStatuses(): Promise<void> {
    try {
      console.log('Generating dynamic order statuses from local orders...');
      
      const defaultStatuses = [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Completed', value: 'completed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Failed', value: 'failed' }
      ];

      const rows = sqlite.getAllSync<any>('SELECT DISTINCT status FROM orders WHERE status IS NOT NULL');
      
      const dynamicStatuses = [...defaultStatuses];
      const existingValues = new Set(defaultStatuses.map(s => s.value));

      if (rows && rows.length > 0) {
        for (const row of rows) {
          if (row.status && !existingValues.has(row.status)) {
            // Format custom status slug to title case (e.g., 'otp-pending' -> 'Otp Pending')
            const label = row.status
              .split('-')
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
              
            dynamicStatuses.push({
              label,
              value: row.status
            });
            existingValues.add(row.status);
          }
        }
      }
      
      useSettingsStore.getState().setOrderStatuses(dynamicStatuses);
      await this.updateSyncTimestamp('order_statuses', JSON.stringify(dynamicStatuses));
      console.log(`Generated ${dynamicStatuses.length} total order statuses`);
    } catch (err) {
      console.error('Failed to generate order statuses:', err);
    }
  },

  async syncCategories(): Promise<void> {
    try {
      console.log('Fetching WooCommerce product categories...');
      const remoteCategories: any[] = await apiClient.get('products/categories?per_page=100');
      if (remoteCategories && Array.isArray(remoteCategories)) {
        for (const item of remoteCategories) {
          const categoryData = {
            id: item.id,
            name: item.name,
            slug: item.slug || '',
            count: item.count || 0,
            lastUpdated: Date.now(),
          };

          await db.insert(categories).values(categoryData).onConflictDoUpdate({
            target: categories.id,
            set: categoryData,
          });
        }
        console.log(`Synced ${remoteCategories.length} product categories`);
      }
    } catch (error) {
      console.error('Failed to sync categories:', error);
    }
  },
};
