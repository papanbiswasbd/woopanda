import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// Open the SQLite database
export const sqlite = openDatabaseSync('woopanda.db', { useNewConnection: true });

// Enable Write-Ahead Logging (WAL) for high performance offline writes/reads
try {
  sqlite.execSync('PRAGMA journal_mode = WAL;');
  sqlite.execSync('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.error('Failed to set sqlite pragmas', e);
}

// Bootstrap schema (safe execution - creates tables if not present)
export function bootstrapDatabase() {
  try {
    // 1. Products Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT,
        permalink TEXT,
        type TEXT DEFAULT 'simple',
        status TEXT DEFAULT 'publish',
        description TEXT,
        short_description TEXT,
        price TEXT,
        regular_price TEXT,
        sale_price TEXT,
        on_sale INTEGER DEFAULT 0,
        purchasable INTEGER DEFAULT 1,
        manage_stock INTEGER DEFAULT 0,
        stock_quantity INTEGER,
        stock_status TEXT DEFAULT 'instock',
        sku TEXT,
        barcode TEXT,
        images TEXT,
        categories TEXT,
        attributes TEXT,
        last_updated INTEGER,
        menu_order INTEGER DEFAULT 0,
        virtual INTEGER DEFAULT 0,
        downloadable INTEGER DEFAULT 0,
        weight TEXT,
        length TEXT,
        width TEXT,
        height TEXT,
        backorders TEXT DEFAULT 'no',
        sold_individually INTEGER DEFAULT 0,
        reviews_allowed INTEGER DEFAULT 1,
        purchase_note TEXT
      );
    `);

    // 2. Orders Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        number TEXT NOT NULL,
        status TEXT NOT NULL,
        currency TEXT,
        date_created TEXT,
        date_modified TEXT,
        discount_total TEXT,
        shipping_total TEXT,
        total TEXT NOT NULL,
        customer_id INTEGER,
        billing TEXT,
        shipping TEXT,
        payment_method TEXT,
        payment_method_title TEXT,
        transaction_id TEXT,
        line_items TEXT,
        notes TEXT,
        last_updated INTEGER
      );
    `);

    // 3. Customers Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        username TEXT,
        avatar_url TEXT,
        billing TEXT,
        shipping TEXT,
        orders_count INTEGER DEFAULT 0,
        total_spent TEXT DEFAULT '0.00',
        last_updated INTEGER
      );
    `);

    // 4. Reviews Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        status TEXT DEFAULT 'approved',
        reviewer TEXT NOT NULL,
        reviewer_email TEXT NOT NULL,
        review TEXT NOT NULL,
        rating INTEGER DEFAULT 5,
        date_created TEXT
      );
    `);

    // 5. Coupons Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY,
        code TEXT NOT NULL,
        amount TEXT NOT NULL,
        discount_type TEXT DEFAULT 'fixed_cart',
        description TEXT,
        usage_count INTEGER DEFAULT 0,
        usage_limit INTEGER,
        date_expires TEXT,
        last_updated INTEGER
      );
    `);

    // 6. Sync Queue Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at INTEGER
      );
    `);

    // 7. Sync Metadata Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // 8. Categories Table
    sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT,
        count INTEGER DEFAULT 0,
        last_updated INTEGER
      );
    `);

    // Progressive migrations
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN menu_order INTEGER DEFAULT 0;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN virtual INTEGER DEFAULT 0;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN downloadable INTEGER DEFAULT 0;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN weight TEXT;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN length TEXT;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN width TEXT;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN height TEXT;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN backorders TEXT DEFAULT 'no';`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN sold_individually INTEGER DEFAULT 0;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN reviews_allowed INTEGER DEFAULT 1;`);
    } catch {}
    try {
      sqlite.execSync(`ALTER TABLE products ADD COLUMN purchase_note TEXT;`);
    } catch {
      // Columns already exist or tables don't exist yet
    }

    console.log('Database tables bootstrapped successfully');
  } catch (error) {
    console.error('Failed to bootstrap database tables:', error);
  }
}

// Instantiate Drizzle
export const db = drizzle(sqlite, { schema });
