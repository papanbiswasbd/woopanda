import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  permalink: text('permalink'),
  type: text('type').default('simple'),
  status: text('status').default('publish'),
  description: text('description'),
  shortDescription: text('short_description'),
  price: text('price'),
  regularPrice: text('regular_price'),
  salePrice: text('sale_price'),
  onSale: integer('on_sale', { mode: 'boolean' }).default(false),
  purchasable: integer('purchasable', { mode: 'boolean' }).default(true),
  manageStock: integer('manage_stock', { mode: 'boolean' }).default(false),
  stockQuantity: integer('stock_quantity'),
  stockStatus: text('stock_status').default('instock'),
  sku: text('sku'),
  barcode: text('barcode'), // Custom barcode scanner mapping
  images: text('images'), // JSON string: Array of { id, src, alt }
  categories: text('categories'), // JSON string: Array of { id, name, slug }
  attributes: text('attributes'), // JSON string: Array of product attributes
  lastUpdated: integer('last_updated'), // Timestamp
  menuOrder: integer('menu_order').default(0),
  virtual: integer('virtual', { mode: 'boolean' }).default(false),
  downloadable: integer('downloadable', { mode: 'boolean' }).default(false),
  weight: text('weight'),
  length: text('length'),
  width: text('width'),
  height: text('height'),
  backorders: text('backorders').default('no'),
  soldIndividually: integer('sold_individually', { mode: 'boolean' }).default(false),
  reviewsAllowed: integer('reviews_allowed', { mode: 'boolean' }).default(true),
  purchaseNote: text('purchase_note'),
});

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey(),
  number: text('number').notNull(),
  status: text('status').notNull(),
  currency: text('currency'),
  dateCreated: text('date_created'),
  dateModified: text('date_modified'),
  discountTotal: text('discount_total'),
  shippingTotal: text('shipping_total'),
  total: text('total').notNull(),
  customerId: integer('customer_id'),
  billing: text('billing'), // JSON string
  shipping: text('shipping'), // JSON string
  paymentMethod: text('payment_method'),
  paymentMethodTitle: text('payment_method_title'),
  transactionId: text('transaction_id'),
  lineItems: text('line_items'), // JSON string
  notes: text('notes'), // JSON string of order notes
  lastUpdated: integer('last_updated'), // Timestamp
});

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey(),
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username'),
  avatarUrl: text('avatar_url'),
  billing: text('billing'), // JSON string
  shipping: text('shipping'), // JSON string
  ordersCount: integer('orders_count').default(0),
  totalSpent: text('total_spent').default('0.00'),
  lastUpdated: integer('last_updated'), // Timestamp
});

export const reviews = sqliteTable('reviews', {
  id: integer('id').primaryKey(),
  productId: integer('product_id'),
  status: text('status').default('approved'),
  reviewer: text('reviewer').notNull(),
  reviewerEmail: text('reviewer_email').notNull(),
  review: text('review').notNull(),
  rating: integer('rating').default(5),
  dateCreated: text('date_created'),
});

export const coupons = sqliteTable('coupons', {
  id: integer('id').primaryKey(),
  code: text('code').notNull(),
  amount: text('amount').notNull(),
  discountType: text('discount_type').default('fixed_cart'),
  description: text('description'),
  usageCount: integer('usage_count').default(0),
  usageLimit: integer('usage_limit'),
  dateExpires: text('date_expires'),
  lastUpdated: integer('last_updated'), // Timestamp
});

export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(), // e.g. 'CREATE_PRODUCT', 'UPDATE_PRODUCT', 'UPDATE_ORDER'
  payload: text('payload').notNull(), // JSON string representing the variables/body
  attempts: integer('attempts').default(0),
  status: text('status').default('pending'), // 'pending', 'processing', 'failed'
  error: text('error'),
  createdAt: integer('created_at'), // Timestamp
});

export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(), // e.g. 'last_products_sync'
  value: text('value'), // Timestamp/date string
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  count: integer('count').default(0),
  lastUpdated: integer('last_updated'),
});
