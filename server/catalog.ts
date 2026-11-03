import { localizeProductSync } from './translate.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import { Store, type ProductRow } from './store.js';
import { AppError, type Supplier } from './types.js';

export const customProductSchema = z.object({
  name: z.string().trim().min(1).max(100), nameEn: z.string().trim().max(100).default(''),
  description: z.string().trim().min(1).max(4000), descriptionEn: z.string().max(4000).default(''),
  category: z.enum(['ai', 'streaming', 'design', 'tools', 'gaming', 'services', 'vpn']),
  priceCents: z.number().int().min(1).max(10000000), delivery: z.enum(['instant', 'manual']),
  requiresEmail: z.boolean().default(false), enabled: z.boolean().default(true),
});
const rawProduct = z.object({
  id: z.string().min(1).max(200), name: z.string().min(1).max(200), description: z.string().optional(),
  price: z.number().finite().nonnegative().max(100000), inStock: z.boolean().optional(), stock: z.number().nullable().optional(),
  requiresEmailActivation: z.boolean().optional(), delivery: z.object({ type: z.string() }).optional(),
  inputKind: z.enum(['','pixel','sheerid']).optional(), initiallyEnabled:z.boolean().optional(),
});

function matchProductStyleText(n: string, inputKind = ''): [string, string] {
  if (inputKind === 'pixel' || (/\bpixel\b/.test(n) && !/google\s*ai|gemini/.test(n))) return ['services', 'pixel'];
  if (inputKind === 'sheerid' || /sheerid/.test(n)) return ['services', 'sheerid'];
  if (/\botp\b|verification\s*number/.test(n)) return ['services', 'otp'];
  if (/apple\s*(id|tv|music|one|arcade)|icloud/.test(n)) return ['tools', 'apple'];
  if (/claude|anthropic/.test(n)) return ['ai', 'claude'];
  if (/codex/.test(n)) return ['ai', 'codex'];
  if (/chatgpt|openai|\bgpt\b/.test(n)) return ['ai', 'chatgpt'];
  if (/gemini|google\s*ai/.test(n)) return ['ai', 'gemini'];
  if (/grok|xai/.test(n)) return ['ai', 'grok'];
  if (/deepseek/.test(n)) return ['ai', 'deepseek'];
  if (/cursor/.test(n)) return ['ai', 'cursor'];
  if (/perplexity/.test(n)) return ['ai', 'perplexity'];
  if (/elevenlabs/.test(n)) return ['ai', 'elevenlabs'];
  if (/minimax/.test(n)) return ['ai', 'minimax'];
  if (/suno/.test(n)) return ['ai', 'suno'];
  if (/kling/.test(n)) return ['ai', 'kling'];
  if (/heygen/.test(n)) return ['ai', 'heygen'];
  if (/runway|seedance/.test(n)) return ['ai', 'runway'];
  if (/lovable|bolt\.new/.test(n)) return ['ai', 'lovable'];
  if (/muse\s*ai|\bmuse\b/.test(n)) return ['ai', 'muse'];
  if (/vibi/.test(n)) return ['ai', 'vibi'];
  if (/qwen/.test(n)) return ['ai', 'qwen'];
  if (/kimi/.test(n)) return ['ai', 'kimi'];
  if (/midjourney|leonardo|openart|dreamina|higgsfield|lartai|meshy|akool/.test(n)) return ['ai', 'midjourney'];
  if (/manus|genspark|kiro|elser|morphic|chatprd|pangram|wispr|granola|arize|antigravity|factory|dropshot|domo|chicken|\bai\b/.test(n)) return ['ai', 'ai'];
  if (/canva/.test(n)) return ['design', 'canva'];
  if (/capcut|supercut/.test(n)) return ['design', 'capcut'];
  if (/adobe|photoshop|illustrator|premiere|lightroom/.test(n)) return ['design', 'adobe'];
  if (/figma/.test(n)) return ['design', 'figma'];
  if (/framer|mobbin|miro|flora|magic\s*patterns|tryclico/.test(n)) return ['design', 'framer'];
  if (/freepik|magnific/.test(n)) return ['design', 'freepik'];
  if (/meitu|wink|xingtu|beautycam|photoroom|cuty|pippit|newtake/.test(n)) return ['design', 'meitu'];
  if (/autodesk|autocad|maya|revit|3ds/.test(n)) return ['design', 'autodesk'];
  if (/netflix/.test(n)) return ['streaming', 'netflix'];
  if (/spotify|brain\.fm/.test(n)) return ['streaming', 'spotify'];
  if (/youtube|vidiq/.test(n)) return ['streaming', 'youtube'];
  if (/disney/.test(n)) return ['streaming', 'disney'];
  if (/tiktok/.test(n)) return ['streaming', 'tiktok'];
  if (/iqiyi/.test(n)) return ['streaming', 'iqiyi'];
  if (/youku/.test(n)) return ['streaming', 'youku'];
  if (/vieon|fpt|tv360|galaxy|shahid|paramount|peacock|locket/.test(n)) return ['streaming', 'vieon'];
  if (/amazon|prime/.test(n)) return ['streaming', 'amazon'];
  if (/gmail/.test(n)) return ['services', 'gmail'];
  if (/hotmail|outlook|emails\b|\bmail\b/.test(n)) return ['services', 'outlook'];
  if (/\botp\b|verification/.test(n)) return ['services', 'otp'];
  if (/telegram|telecampaign/.test(n)) return ['services', 'telegram'];
  if (/discord/.test(n)) return ['services', 'discord'];
  if (/facebook/.test(n)) return ['services', 'facebook'];
  if (/\bx\s+(premium|account|blue)|twitter/.test(n)) return ['services', 'x'];
  if (/apple|icloud/.test(n)) return ['tools', 'apple'];
  if (/google/.test(n)) return ['tools', 'google'];
  if (/notion/.test(n)) return ['tools', 'notion'];
  if (/microsoft|office/.test(n)) return ['tools', 'office'];
  if (/windows/.test(n)) return ['tools', 'windows'];
  if (/zoom/.test(n)) return ['tools', 'zoom'];
  if (/nordvpn|\bnord\b/.test(n)) return ['vpn', 'nordvpn'];
  if (/expressvpn/.test(n)) return ['vpn', 'expressvpn'];
  if (/surfshark/.test(n)) return ['vpn', 'surfshark'];
  if (/avira/.test(n)) return ['vpn', 'avira'];
  if (/kaspersky/.test(n)) return ['vpn', 'kaspersky'];
  if (/norton/.test(n)) return ['vpn', 'norton'];
  if (/proton/.test(n)) return ['vpn', 'proton'];
  if (/hma|adguard|ipvanish|purevpn|v2ray|proxyscrape|proxy|vpn/.test(n)) return ['vpn', 'vpn'];
  if (/gpm/.test(n)) return ['tools', 'gpm'];
  if (/duolingo|memrise/.test(n)) return ['tools', 'duolingo'];
  if (/coursera|edx|udemy|skillshare/.test(n)) return ['tools', 'coursera'];
  if (/quizlet|kahoot/.test(n)) return ['tools', 'quizlet'];
  if (/grammarly|scribd|ilovepdf|descript/.test(n)) return ['tools', 'grammarly'];
  if (/gamma/.test(n)) return ['tools', 'gamma'];
  if (/jetbrains|replit|warp|github|supabase|railway|n8n|posthog|resend|airtable|intercom|gumloop|jam/.test(n)) return ['tools', 'dev'];
  if (/steam|game|xbox|freefire/.test(n)) return ['gaming', 'gaming'];
  return ['tools', 'generic'];
}

export function detectProductStyle(name: string, inputKind = ''): [string, string] {
  if (inputKind === 'pixel') return ['services', 'pixel'];
  if (inputKind === 'sheerid') return ['services', 'sheerid'];
  const primary = (name.split(/\s*[–—]\s*|\s+-\s+/)[0] || name).toLowerCase();
  const [cat, brand] = matchProductStyleText(primary, inputKind);
  if (brand !== 'generic') return [cat, brand];
  return matchProductStyleText(name.toLowerCase(), inputKind);
}

export class Catalog {
  private syncing = new Map<string, Promise<number>>();
  constructor(public store: Store, private config: Config, public providers: Map<string, Supplier>) {}
  async sync(provider = 'prodseller') {
    const running = this.syncing.get(provider);
    if (running) return running;
    const task = this.doSync(provider).finally(() => { this.syncing.delete(provider); });
    this.syncing.set(provider, task);
    return task;
  }
  private async doSync(provider: string) {
    const source = this.providers.get(provider); if (!source) throw new AppError(400, '供应商未配置');
    const mode = provider === 'prodseller' ? this.config.PRODSELLER_MODE : 'live';
    const products = await source.products();
    // An administrator may have replaced the adapter while this request was in flight.
    if (this.providers.get(provider) !== source || (provider === 'prodseller' && this.config.PRODSELLER_MODE !== mode)) throw new AppError(409, '供应商连接已更换，请重新同步', 'SUPPLIER_CHANGED');
    return this.applySnapshot(provider, mode, products);
  }
  prodsellerSettings(): { name?: string; enabled?: boolean; markupPercent?: number | null; autoEnable?: boolean } {
    const base = { enabled: true, markupPercent: null as number | null, autoEnable: true };
    const ps = this.store.get<{value:string}>("SELECT value FROM settings WHERE name='prodseller'");
    if (ps) { try { Object.assign(base, this.store.decrypt<Record<string, unknown>>(ps.value)); } catch {} }
    const prefs = this.store.get<{value:string}>("SELECT value FROM settings WHERE name='prodseller_prefs'");
    if (prefs) { try { Object.assign(base, this.store.decrypt<Record<string, unknown>>(prefs.value)); } catch {} }
    return base;
  }
  prodsellerEnabled(): boolean {
    return this.prodsellerSettings().enabled !== false;
  }
  supplierMarkup(provider: string): number {
    if (provider === 'prodseller') return this.prodsellerSettings().markupPercent ?? this.config.MARKUP_PERCENT;
    const row = this.store.get<{markup_percent:number|null}>('SELECT markup_percent FROM supplier_connections WHERE id=?', provider);
    return row?.markup_percent ?? this.config.MARKUP_PERCENT;
  }
  supplierAutoEnable(provider: string): boolean {
    if (provider === 'prodseller') return this.prodsellerSettings().autoEnable !== false;
    const row = this.store.get<{auto_enable:number}>('SELECT auto_enable FROM supplier_connections WHERE id=?', provider);
    return row ? row.auto_enable !== 0 : true;
  }
  recalculatePrices(provider?: string, clearOverrides = false): number {
    const rows = provider
      ? this.store.all<{id:string;provider:string;cost_usdt:number}>("SELECT id,provider,cost_usdt FROM products WHERE provider=? AND provider!='local'", provider)
      : this.store.all<{id:string;provider:string;cost_usdt:number}>("SELECT id,provider,cost_usdt FROM products WHERE provider!='local'");
    let updated = 0;
    const now = new Date().toISOString();
    this.store.transaction(() => {
      const markups = new Map<string, number>();
      for (const r of rows) {
        if (!markups.has(r.provider)) markups.set(r.provider, this.supplierMarkup(r.provider));
        const markup = markups.get(r.provider)!;
        const price = Math.max(1, Math.ceil(r.cost_usdt * this.config.USDT_CNY_RATE * (1 + markup / 100) * 100 - 1e-8));
        const res = clearOverrides
          ? this.store.run('UPDATE products SET price_override=NULL, price_cents=?, updated_at=? WHERE id=?', price, now, r.id)
          : this.store.run('UPDATE products SET price_cents=COALESCE(price_override,?), updated_at=? WHERE id=?', price, now, r.id);
        updated += Number(res.changes);
      }
    });
    return updated;
  }
  applySnapshot(provider: string, mode: 'demo' | 'live', rawProducts: unknown, saveConnection?: () => void) {
    const products = z.array(rawProduct).parse(rawProducts);
    // Validate the complete response before changing any catalog data.
    const now = new Date().toISOString();
    this.store.transaction(() => {
      saveConnection?.();
      const markup = this.supplierMarkup(provider);
      const autoEnable = this.supplierAutoEnable(provider);
      this.store.run('UPDATE products SET in_stock=0 WHERE provider=?', provider);
      for (const p of products) {
        const [category, brand] = detectProductStyle(p.name, p.inputKind);
        const delivery = p.requiresEmailActivation ? 'activation' : p.delivery?.type === 'instant' ? 'instant' : 'manual';
        const loc = mode === 'live'
          ? localizeProductSync({ sourceId: p.id, name: p.name, description: p.description ?? '', delivery, requiresEmail: !!p.requiresEmailActivation, inputKind: p.inputKind ?? '' })
          : { nameZh: p.name, nameEn: '', descZh: p.description ?? '', descEn: '' };
        const price = Math.max(1, Math.ceil(p.price * this.config.USDT_CNY_RATE * (1 + markup / 100) * 100 - 1e-8));
        const initialEnabled = p.initiallyEnabled === false ? 0 : (autoEnable ? 1 : 0);
        this.store.run(`INSERT INTO products(id,provider,source_id,source_mode,name,name_en,description,description_en,category,brand,cost_usdt,price_cents,in_stock,requires_email,delivery,input_kind,enabled,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,source_id) DO UPDATE SET
          name=CASE WHEN products.name_en='' OR products.name=products.name_en THEN excluded.name ELSE products.name END,
          name_en=CASE WHEN products.name_en='' THEN excluded.name_en ELSE products.name_en END,
          description=CASE WHEN products.description='' OR products.description_en='' OR products.description=products.description_en THEN excluded.description ELSE products.description END,
          description_en=CASE WHEN products.description_en='' THEN excluded.description_en ELSE products.description_en END,
          brand=excluded.brand, category=excluded.category, cost_usdt=excluded.cost_usdt, price_cents=COALESCE(products.price_override,excluded.price_cents),
          in_stock=excluded.in_stock, requires_email=excluded.requires_email, delivery=excluded.delivery, input_kind=excluded.input_kind, updated_at=excluded.updated_at, source_mode=excluded.source_mode`,
          `${provider}-${p.id}`, provider, p.id, mode, loc.nameZh, loc.nameEn, loc.descZh, loc.descEn, category, brand, p.price, price,
          p.inStock === true || (p.inStock === undefined && (p.stock === null || (p.stock ?? 0) > 0)) ? 1 : 0,
          p.requiresEmailActivation ? 1 : 0, delivery, p.inputKind??'', initialEnabled, now);
      }
      if (mode === 'demo') this.store.run("UPDATE products SET name_en=name, description_en='Demo product for testing only. No real subscription is activated. Review delivery type and provide an email when requested.' WHERE provider=? AND name_en=''", provider);
      this.store.audit('catalog.sync', provider);
    });
    return products.length;
  }
  product(id: string) {
    const p = this.store.get<ProductRow>('SELECT * FROM products WHERE id=?', id);
    if (!p) throw new AppError(404, '商品不存在', 'PRODUCT_NOT_FOUND');
    return p;
  }
  publicProduct(p: ProductRow, stockMap?: Map<string, number>, soldMap?: Map<string, number>) {
    const stock = p.provider === 'local' && p.delivery === 'instant' ? (stockMap ? (stockMap.get(p.id) ?? 0) : this.store.get<{n:number}>('SELECT COUNT(*) AS n FROM inventory WHERE product_id=? AND order_id IS NULL', p.id)!.n) : null;
    const [, detectedBrand] = detectProductStyle(`${p.name} ${p.name_en}`, p.input_kind);
    return { id: p.id, name: p.name, nameEn: p.name_en, description: p.description, descriptionEn: p.description_en,
      category: p.category, brand: p.brand && p.brand !== 'generic' ? p.brand : detectedBrand, priceCents: p.price_cents, inStock: stock === null ? !!p.in_stock : stock > 0,
      requiresEmail: !!p.requires_email, delivery: p.delivery, demo: p.provider !== 'local' && p.source_mode === 'demo', stock,
      maxQuantity: this.providers.get(p.provider)?.maxQuantity ?? 20,
      inputKind:p.input_kind, updatedAt:p.updated_at, soldCount:soldMap?.get(p.id) ?? 0,
    };
  }
  list(admin = false) {
    const showSupplier = admin || (this.prodsellerEnabled() && !(this.config.PRODSELLER_MODE === 'demo' && this.config.PAYMENT_MODE === 'manual'));
    const names = new Map(admin ? this.store.all<{id:string;name:string}>('SELECT id,name FROM supplier_connections').map(s=>[s.id,s.name]) : []);
    if (admin) {
      const ps = this.store.get<{value:string}>("SELECT value FROM settings WHERE name='prodseller'");
      const psName = ps ? (this.store.decrypt<{name?:string}>(ps.value).name || "ProdSeller") : "ProdSeller";
      names.set("prodseller", psName);
    }
    const stockMap = new Map(this.store.all<{product_id:string;n:number}>('SELECT product_id, COUNT(*) AS n FROM inventory WHERE order_id IS NULL GROUP BY product_id').map(r => [r.product_id, r.n]));
    const soldMap = new Map(this.store.all<{product_id:string;n:number}>("SELECT product_id, SUM(quantity) AS n FROM orders WHERE payment_status='paid' AND payment_mode!='demo' GROUP BY product_id").map(r => [r.product_id, r.n]));
    return this.store.all<ProductRow>(`SELECT * FROM products WHERE (provider='local' OR (provider='prodseller' AND source_mode=? AND ?=1) OR (provider!='prodseller' AND provider!='local' AND source_mode='live' AND EXISTS (SELECT 1 FROM supplier_connections s WHERE s.id=products.provider ${admin ? '' : 'AND s.enabled=1'}))) ${admin ? '' : 'AND enabled=1'} ORDER BY rowid`, this.config.PRODSELLER_MODE, +showSupplier).map(p => ({ ...this.publicProduct(p, stockMap, soldMap), ...(admin ? { provider: p.provider, providerName:names.get(p.provider), sourceId: p.source_id, enabled: !!p.enabled, costUsdt: p.cost_usdt } : {}) }));
  }
  create(input: z.infer<typeof customProductSchema>) {
    const id = `local-${randomUUID()}`;
    const [, brand] = detectProductStyle(input.name);
    this.store.run(`INSERT INTO products(id,provider,source_id,name,name_en,description,description_en,category,brand,price_cents,requires_email,delivery,enabled,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, 'local', id, input.name, input.nameEn, input.description, input.descriptionEn, input.category, brand, input.priceCents, +input.requiresEmail, input.delivery, +input.enabled, new Date().toISOString());
    this.store.audit('product.create', id);
    return id;
  }
}
