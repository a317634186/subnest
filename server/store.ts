import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function redactSecrets(input: string, extraSecrets: string[] = []): string {
  if (!input) return input;
  let out = input
    .replace(/\b(psk|qv_live|qv_test|pxl|sk|rk|pk)_[A-Za-z0-9_\-]{6,}/gi, "[REDACTED_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._\-~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/MII[A-Za-z0-9+/=\r\n]{24,}/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[REDACTED_HEX_KEY]");
  for (const sec of extraSecrets) {
    if (sec && sec.length >= 8) out = out.replaceAll(sec, "[REDACTED]");
  }
  return out;
}
export class Store {
  db: DatabaseSync;
  private key: Buffer;
  constructor(path: string, key: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.key = Buffer.from(key, 'hex');
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') {
      for (const f of [path, `${path}-wal`, `${path}-shm`, ".env"]) {
        if (existsSync(f)) { try { chmodSync(f, 0o600); } catch {} }
      }
    }
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_id TEXT NOT NULL, source_mode TEXT NOT NULL DEFAULT 'unknown',
        name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'tools', brand TEXT NOT NULL DEFAULT 'generic',
        cost_usdt REAL NOT NULL DEFAULT 0, price_cents INTEGER NOT NULL, price_override INTEGER,
        in_stock INTEGER NOT NULL DEFAULT 1, requires_email INTEGER NOT NULL DEFAULT 0,
        delivery TEXT NOT NULL DEFAULT 'instant', input_kind TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, UNIQUE(provider, source_id)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, checkout_id TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
        product_id TEXT NOT NULL, product_name TEXT NOT NULL, provider TEXT NOT NULL, source_id TEXT NOT NULL,
        source_mode TEXT NOT NULL, payment_mode TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL, cost_usdt REAL NOT NULL, payment_channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting_payment', payment_status TEXT NOT NULL DEFAULT 'unpaid',
        private_data TEXT NOT NULL, delivery_data TEXT, supplier_order_id TEXT, last_error TEXT,
        lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, last_checked INTEGER NOT NULL DEFAULT 0,
        purchase_started INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT
      );
      CREATE INDEX IF NOT EXISTS orders_work ON orders(status, last_checked);
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id),
        secret TEXT NOT NULL, secret_hash TEXT NOT NULL, order_id TEXT REFERENCES orders(id),
        UNIQUE(product_id, secret_hash)
      );
      CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, instructions TEXT NOT NULL DEFAULT '', instructions_en TEXT NOT NULL DEFAULT '', qr_url TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS supplier_connections (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, base_url TEXT NOT NULL,
        auth_header TEXT NOT NULL, auth_prefix TEXT NOT NULL, paths TEXT NOT NULL,
        key_cipher TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        supports_idempotency INTEGER NOT NULL DEFAULT 0, provider_type TEXT NOT NULL DEFAULT 'compatible', coin_to_cny REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    if (!this.all<{name:string}>('PRAGMA table_info(orders)').some(c => c.name === 'purchase_started')) this.db.exec('ALTER TABLE orders ADD COLUMN purchase_started INTEGER NOT NULL DEFAULT 0');
    if (!this.all<{name:string}>('PRAGMA table_info(products)').some(c => c.name === 'source_mode')) {
      this.db.exec("ALTER TABLE products ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'unknown'; UPDATE products SET source_mode='demo' WHERE source_id LIKE 'demo-%'");
    }
    if (!this.all<{name:string}>('PRAGMA table_info(products)').some(c => c.name === 'input_kind')) this.db.exec("ALTER TABLE products ADD COLUMN input_kind TEXT NOT NULL DEFAULT ''");
    if (!this.all<{name:string}>('PRAGMA table_info(supplier_connections)').some(c => c.name === 'coin_to_cny')) this.db.exec('ALTER TABLE supplier_connections ADD COLUMN coin_to_cny REAL NOT NULL DEFAULT 1');
    if (!this.all<{name:string}>('PRAGMA table_info(supplier_connections)').some(c => c.name === 'markup_percent')) this.db.exec('ALTER TABLE supplier_connections ADD COLUMN markup_percent REAL DEFAULT NULL');
    if (!this.all<{name:string}>('PRAGMA table_info(supplier_connections)').some(c => c.name === 'auto_enable')) this.db.exec('ALTER TABLE supplier_connections ADD COLUMN auto_enable INTEGER NOT NULL DEFAULT 1');
    for (const channel of ['alipay', 'wechat', 'bank', 'binance']) this.run('INSERT OR IGNORE INTO channels(id) VALUES (?)', channel);
  }
  all<T = Record<string, unknown>>(sql: string, ...args: (string | number | null)[]): T[] { return this.db.prepare(sql).all(...args) as T[]; }
  get<T = Record<string, unknown>>(sql: string, ...args: (string | number | null)[]): T | undefined { return this.db.prepare(sql).get(...args) as T | undefined; }
  run(sql: string, ...args: (string | number | null)[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  encrypt(value: unknown) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('base64')}`;
  }
  decrypt<T>(value: string): T {
    const [iv, tag, payload] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8')) as T;
  }
  audit(action: string, target: string) { this.run('INSERT INTO audit(action,target,created_at) VALUES (?,?,?)', action, target, new Date().toISOString()); }
  close() { this.db.close(); }
}
export interface ProductRow {
  id: string; provider: string; source_id: string; source_mode: string; name: string; name_en: string; description: string; description_en: string;
  category: string; brand: string; cost_usdt: number; price_cents: number; price_override: number | null;
  in_stock: number; requires_email: number; delivery: string; input_kind: string; enabled: number; updated_at: string;
}
export interface SupplierConnectionRow {
  id: string; name: string; base_url: string; auth_header: string; auth_prefix: string;
  paths: string; key_cipher: string; enabled: number; supports_idempotency: number;
  provider_type: string; coin_to_cny: number; markup_percent: number | null; auto_enable: number; created_at: string; updated_at: string;
}
export interface OrderRow {
  id: string; checkout_id: string; token_hash: string; fingerprint: string; product_id: string; product_name: string;
  provider: string; source_id: string; source_mode: string; payment_mode: string; quantity: number; unit_price_cents: number;
  total_cents: number; cost_usdt: number; payment_channel: string; status: string; payment_status: string;
  private_data: string; delivery_data: string | null; supplier_order_id: string | null; last_error: string | null;
  lease_until: number; attempts: number; last_checked: number; purchase_started: number; created_at: string; updated_at: string; paid_at: string | null;
}
