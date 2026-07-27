import { db, sqlite } from '../database/db';
import { products, orders, customers, reviews, coupons, syncMetadata, categories } from '../database/schema';
import { eq } from 'drizzle-orm';
import { apiClient } from './api/client';
import { syncQueueService } from './syncQueueService';
import { useSettingsStore } from '../store/settingsStore';

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

  async syncAll(): Promise<void> {
    console.log('Starting full background sync...');
    try {
      // First process the offline sync queue
      await syncQueueService.processQueue();

      // Run fetches in parallel
      await Promise.allSettled([
        this.syncStoreCurrency(),
        this.syncProducts(),
        this.syncCategories(),
        this.syncOrders(),
        this.syncCustomers(),
        this.syncCoupons(),
        this.syncReviews(),
      ]);

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

  async syncOrders(): Promise<void> {
    try {
      const lastSync = await this.getSyncTimestamp('orders_last_sync');
      let endpoint = 'orders?per_page=50';
      if (lastSync) {
        endpoint += `&modified_after=${encodeURIComponent(lastSync)}`;
      }

      const remoteOrders: any[] = await apiClient.get(endpoint);
      if (remoteOrders && remoteOrders.length > 0) {
        for (const item of remoteOrders) {
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

          await db.insert(orders).values(orderData).onConflictDoUpdate({
            target: orders.id,
            set: orderData,
          });
        }
      }

      await this.updateSyncTimestamp('orders_last_sync', new Date().toISOString());
      console.log(`Synced ${remoteOrders.length} orders`);
    } catch (error) {
      console.error('Failed to sync orders:', error);
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
      const res = sqlite.getAllSync<{ currency: string }>(
        "SELECT currency FROM orders WHERE currency IS NOT NULL AND currency != '' LIMIT 1"
      );
      if (res && res.length > 0) {
        const currencyCode = res[0].currency;
        console.log('Resolved fallback store currency from local orders:', currencyCode);
        useSettingsStore.getState().setCurrency(currencyCode);
      }
    } catch (sqliteErr) {
      console.error('SQLite currency fallback failed:', sqliteErr);
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
