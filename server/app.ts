import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { Config } from './config.js';
import { Store, hash, redactSecrets, type OrderRow } from './store.js';
import { Catalog, customProductSchema } from './catalog.js';
import { checkoutSchema, submitServiceInputSchema, Orders } from './orders.js';
import { AppError, type Supplier } from './types.js';
import { DemoSupplier } from './demo.js';
import { ProdSeller, defaultProdSellerPaths, type ProdSellerOptions } from './supplier.js';
import { CustomProviders } from './custom-providers.js';
import { AlipayGateway } from './alipay.js';
import { customSupplierSchema, supplierPathsSchema, type CustomSupplierConfig } from './compatible-supplier.js';

const prodsellerStoredSchema = z.object({
  apiKey: z.string().min(8),
  name: z.string().trim().min(1).max(80).default('ProdSeller'),
  baseUrl: customSupplierSchema.shape.baseUrl.default('https://prodseller.com/v1'),
  authHeader: customSupplierSchema.shape.authHeader.default('X-API-Key'),
  authPrefix: customSupplierSchema.shape.authPrefix.default(''),
  paths: supplierPathsSchema.default(defaultProdSellerPaths),
  enabled: z.boolean().default(true),
  markupPercent: z.number().min(0).max(1000).nullable().optional().default(null),
  autoEnable: z.boolean().optional().default(true),
});
const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(1).max(80).default('SubNest 订阅集'),
  exchangeRate: z.number().min(0.01).max(1000).default(7.2),
  markupPercent: z.number().min(0).max(1000).default(35),
  supportEmail: z.string().trim().max(120).default('support@example.com'),
  supportWechat: z.string().trim().max(120).default('support_wechat'),
  supportTelegram: z.string().trim().max(200).default('t.me/support_contact'),
  announcementZh: z.string().trim().max(200).default('把更好的数字生活，放进你的日常。'),
  announcementEn: z.string().trim().max(200).default('Your everyday, with a little more possibility.'),
});
export function createApp(config: Config, supplied?: Supplier, providerFactory: (key: string, options?: ProdSellerOptions) => Supplier = (key, options) => new ProdSeller(key, fetch, 3300, options), customFactory?: (input:CustomSupplierConfig)=>Supplier) {
  const store = new Store(config.DATABASE_PATH, config.DATA_ENCRYPTION_KEY);
  let storeSettings = {
    storeName: config.STORE_NAME || 'SubNest 订阅集',
    exchangeRate: config.USDT_CNY_RATE,
    markupPercent: config.MARKUP_PERCENT,
    supportEmail: config.SUPPORT_EMAIL || 'support@example.com',
    supportWechat: config.SUPPORT_WECHAT || 'support_wechat',
    supportTelegram: config.SUPPORT_TELEGRAM || 't.me/support_contact',
    announcementZh: '把更好的数字生活，放进你的日常。',
    announcementEn: 'Your everyday, with a little more possibility.',
  };
  const savedStoreSettings = store.get<{value: string}>("SELECT value FROM settings WHERE name='store_settings'");
  if (savedStoreSettings) {
    try {
      storeSettings = storeSettingsSchema.parse({ ...storeSettings, ...store.decrypt<Record<string, unknown>>(savedStoreSettings.value) });
      config.STORE_NAME = storeSettings.storeName;
      config.USDT_CNY_RATE = storeSettings.exchangeRate;
      config.MARKUP_PERCENT = storeSettings.markupPercent;
      config.SUPPORT_EMAIL = storeSettings.supportEmail;
      config.SUPPORT_WECHAT = storeSettings.supportWechat;
      config.SUPPORT_TELEGRAM = storeSettings.supportTelegram;
    } catch {}
  }
  let prodsellerMeta: { name: string; baseUrl: string; authHeader: string; authPrefix: string; paths: typeof defaultProdSellerPaths; enabled: boolean; markupPercent: number | null; autoEnable: boolean } = { name: 'ProdSeller', baseUrl: 'https://prodseller.com/v1', authHeader: 'X-API-Key', authPrefix: '', paths: { ...defaultProdSellerPaths }, enabled: true, markupPercent: null, autoEnable: true };
  const savedConnection = store.get<{value: string}>("SELECT value FROM settings WHERE name='prodseller'");
  if (savedConnection) {
    const connection = prodsellerStoredSchema.parse(store.decrypt(savedConnection.value));
    config.PRODSELLER_API_KEY = connection.apiKey;
    config.PRODSELLER_MODE = 'live';
    config.PAYMENT_MODE = 'manual';
    prodsellerMeta = { name: connection.name, baseUrl: connection.baseUrl, authHeader: connection.authHeader, authPrefix: connection.authPrefix, paths: connection.paths, enabled: connection.enabled !== false, markupPercent: connection.markupPercent ?? null, autoEnable: connection.autoEnable !== false };
  }
  const savedPrefs = store.get<{value: string}>("SELECT value FROM settings WHERE name='prodseller_prefs'");
  if (savedPrefs) {
    try {
      const prefs = store.decrypt<{enabled?: boolean; markupPercent?: number | null; autoEnable?: boolean}>(savedPrefs.value);
      if (prefs.enabled !== undefined) prodsellerMeta.enabled = prefs.enabled;
      if (prefs.markupPercent !== undefined) prodsellerMeta.markupPercent = prefs.markupPercent;
      if (prefs.autoEnable !== undefined) prodsellerMeta.autoEnable = prefs.autoEnable;
    } catch {}
  }
  // Register additional API adapters here; each implements Supplier.
  const providers = new Map<string, Supplier>([['prodseller', supplied ?? (config.PRODSELLER_MODE === 'demo' ? new DemoSupplier() : providerFactory(config.PRODSELLER_API_KEY, prodsellerMeta))]]);
  const catalog = new Catalog(store, config, providers); const orders = new Orders(store, catalog, config);
  const orderChallenges = new Map<string, { answer:number; ip:string; expires:number }>();
  const customProviders = new CustomProviders(store, config, catalog, customFactory);customProviders.load();
  if (config.AIPAY_APP_ID && (config.AIPAY_PRIVATE_KEY || config.AIPAY_PRIVATE_PKCS_KEY)) {
    store.run("INSERT INTO settings(name,value) VALUES ('alipay',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", store.encrypt({
      gatewayUrl: config.AIPAY_GATEWAY_URL,
      appId: config.AIPAY_APP_ID,
      publicKey: config.AIPAY_PUBLIC_KEY,
      privateKey: config.AIPAY_PRIVATE_KEY,
      privatePkcsKey: config.AIPAY_PRIVATE_PKCS_KEY,
      alipayPublicKey: config.AIPAY_ALIPAY_PUBLIC_KEY,
    }));
  } else {
    const savedAlipay = store.get<{value: string}>("SELECT value FROM settings WHERE name='alipay'");
    if (savedAlipay) {
      try {
        const dec = store.decrypt<Record<string, string>>(savedAlipay.value);
        if (dec.appId) config.AIPAY_APP_ID = dec.appId;
        if (dec.gatewayUrl) config.AIPAY_GATEWAY_URL = dec.gatewayUrl;
        if (dec.publicKey) config.AIPAY_PUBLIC_KEY = dec.publicKey;
        if (dec.privateKey) config.AIPAY_PRIVATE_KEY = dec.privateKey;
        if (dec.privatePkcsKey) config.AIPAY_PRIVATE_PKCS_KEY = dec.privatePkcsKey;
        if (dec.alipayPublicKey) config.AIPAY_ALIPAY_PUBLIC_KEY = dec.alipayPublicKey;
      } catch {}
    }
  }
  const alipay = new AlipayGateway(config);
  if (alipay.enabled) {
    store.run("UPDATE channels SET enabled=1, instructions=CASE WHEN instructions='' THEN '已接入支付宝在线支付网关，点击下方“前往支付宝付款”即可跳转支付宝完成支付；也可转账后提交交易号核款。' ELSE instructions END, instructions_en=CASE WHEN instructions_en='' THEN 'Alipay gateway is enabled. Click Pay with Alipay below to complete payment, or submit your transaction reference.' ELSE instructions_en END WHERE id='alipay' AND enabled=0");
  }
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'https:'], 'upgrade-insecure-requests': config.COOKIE_SECURE === 'true' ? [] : null } }, strictTransportSecurity: config.COOKIE_SECURE === 'true' ? undefined : false }));
  app.use(express.json({ limit: '300kb' }), cookieParser());
  app.use('/api', rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '请求过于频繁，请稍后再试', code: 'RATE_LIMITED' } }));
  const origins = new Set([new URL(config.APP_URL).origin, `http://localhost:${config.PORT}`, `http://127.0.0.1:${config.PORT}`]);
  if (config.COOKIE_SECURE !== 'true') { origins.add('http://localhost:5180'); origins.add('http://127.0.0.1:5180'); }
  app.use('/api', (req, res, next) => {
    res.set({'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'});
    if (req.path === '/payments/alipay/notify') return next();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return next(new AppError(403, '不允许跨站请求', 'ORIGIN_REJECTED'));
      if (!req.is('application/json')) return next(new AppError(415, '仅支持 JSON 请求'));
    }
    next();
  });
  const adminSalt = randomBytes(16); const passwordHash = scryptSync(config.ADMIN_PASSWORD, adminSalt, 32);
  function admin(req: Request, _res: Response, next: NextFunction) {
    store.run('DELETE FROM sessions WHERE expires_at<?', Date.now());
    const cookie = req.cookies.subnest_admin;
    const session = typeof cookie === 'string' && store.get<{expires_at:number}>('SELECT expires_at FROM sessions WHERE token_hash=?', hash(cookie));
    if (!session || session.expires_at < Date.now()) return next(new AppError(401, '请先登录管理后台', 'LOGIN_REQUIRED'));
    next();
  }
  function channelList(adminView = false) {
    return store.all<{id:string;enabled:number;instructions:string;instructions_en:string;qr_url:string}>('SELECT * FROM channels').map(c => ({
      id: c.id, enabled: !!c.enabled, instructions: c.instructions, instructionsEn: c.instructions_en, qrUrl: c.qr_url,
      available: config.PAYMENT_MODE === 'demo' || !!c.enabled,
    })).filter(c => adminView || c.available);
  }
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/sitemap.xml', (_req,res) => {
    const origin=new URL(config.APP_URL).origin;
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><changefreq>daily</changefreq></url></urlset>`);
  });
  app.get('/api/config', (_req, res) => res.json({ storeName: config.STORE_NAME, demo: config.PAYMENT_MODE === 'demo', supplierDemo: config.PRODSELLER_MODE === 'demo', currency: 'CNY', exchangeRate: config.USDT_CNY_RATE, supportEmail: config.SUPPORT_EMAIL || 'support@example.com', supportWechat: config.SUPPORT_WECHAT || 'support_wechat', supportTelegram: config.SUPPORT_TELEGRAM || 't.me/support_contact', announcementZh: storeSettings.announcementZh, announcementEn: storeSettings.announcementEn, alipayGateway: alipay.enabled ? 'enabled' : undefined, confirmedOrderCount: store.get<{n:number}>("SELECT COUNT(*) AS n FROM orders WHERE payment_status='paid'")?.n ?? 0, channels: channelList() }));
  app.get('/api/products', (_req, res) => res.json({ products: catalog.list() }));
  const checkoutLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, message: { error: '下单过于频繁，请稍后再试', code: 'RATE_LIMITED' } });
  app.post('/api/orders', checkoutLimit, (req, res) => res.status(201).json(orders.create(checkoutSchema.parse(req.body))));
  const token = (req: Request) => req.headers.authorization?.replace(/^Bearer /, '');
  const resolveOrder = async (id:string, accessToken?:string) => {
    const o = orders.authorize(id, accessToken);
    if (alipay.enabled && o.payment_channel === 'alipay' && o.payment_status !== 'paid') {
      const paid = await alipay.queryPaidTrade(o.id, o.total_cents);
      if (paid) {
        orders.submitPayment(o, `ALIPAY:${paid.tradeNo}`);
        await orders.confirmPayment(o.id);
        store.audit('alipay.query', o.id);
      }
    }
    await orders.refresh(o.id);
    return orders.view(orders.get(o.id));
  };
  app.get('/api/order-challenge', rateLimit({windowMs:10*60000,limit:30,message:{error:'请求过于频繁，请稍后再试',code:'RATE_LIMITED'}}), (req,res) => {
    const left = 10 + (randomBytes(1)[0]! % 40); const right = 10 + (randomBytes(1)[0]! % 40);
    const id = randomBytes(18).toString('hex'); const now = Date.now();
    for (const [key, challenge] of orderChallenges) if (challenge.expires < now) orderChallenges.delete(key);
    orderChallenges.set(id,{answer:left+right,ip:req.ip??'',expires:now+5*60000});
    res.json({id,question:`${left} + ${right} = ?`});
  });
  app.post('/api/orders/lookup', rateLimit({windowMs:15*60000,limit:20,message:{error:'查询过于频繁，请 15 分钟后重试',code:'RATE_LIMITED'}}), async (req,res) => {
    const input=z.object({id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/i),challengeId:z.string().regex(/^[a-f0-9]{36}$/),answer:z.number().int().min(0).max(98)}).parse(req.body);
    const challenge=orderChallenges.get(input.challengeId); orderChallenges.delete(input.challengeId);
    if(!challenge||challenge.expires<Date.now()||challenge.ip!==(req.ip??'')||challenge.answer!==input.answer)throw new AppError(400,'验证码错误或已过期，请重新计算','CAPTCHA_INVALID');
    res.json(await resolveOrder(input.id,input.token));
  });
  app.get('/api/orders/:id', async (req, res) => res.json(await resolveOrder(req.params.id as string, token(req))));
  app.post('/api/orders/:id/payment', (req, res) => {
    const o = orders.authorize(req.params.id as string, token(req));
    const { reference } = z.object({ reference: z.string().trim().min(3).max(200) }).parse(req.body);
    res.json(orders.submitPayment(o, reference));
  });
  app.post('/api/orders/:id/alipay-url', async (req, res) => {
    const o = orders.authorize(req.params.id as string, token(req));
    const view = orders.view(o);
    res.json(await alipay.resolvePayUrls({ id: o.id, productName: view.productName, quantity: o.quantity, totalCents: o.total_cents }));
  });
  app.get('/api/payments/alipay/return', async (req, res) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') params[k] = v;
    if (!alipay.verifyCallback(params) || params.app_id !== alipay.appId || !params.out_trade_no) {
      throw new AppError(400, '支付宝回调签名校验失败', 'VALIDATION_ERROR');
    }
    const o = orders.get(params.out_trade_no);
    if (Number(params.total_amount).toFixed(2) !== (o.total_cents / 100).toFixed(2)) {
      throw new AppError(400, '支付宝支付金额与订单不符', 'VALIDATION_ERROR');
    }
    if (params.trade_no) orders.submitPayment(o, `ALIPAY:${params.trade_no}`);
    await orders.confirmPayment(o.id);
    store.audit('alipay.return', o.id);
    res.redirect('/#orders');
  });
  app.post('/api/payments/alipay/notify', express.urlencoded({ extended: false }), async (req, res) => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) if (typeof v === 'string') params[k] = v;
    if (!alipay.verifyCallback(params) || params.app_id !== alipay.appId || !params.out_trade_no) {
      return res.status(400).type('text/plain').send('failure');
    }
    const o = orders.get(params.out_trade_no);
    if (Number(params.total_amount).toFixed(2) !== (o.total_cents / 100).toFixed(2)) {
      return res.status(400).type('text/plain').send('failure');
    }
    if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
      if (params.trade_no) orders.submitPayment(o, `ALIPAY:${params.trade_no}`);
      await orders.confirmPayment(o.id);
      store.audit('alipay.notify', o.id);
    }
    res.type('text/plain').send('success');
  });
  app.post('/api/orders/:id/demo-pay', async (req, res) => {
    const o = orders.authorize(req.params.id as string, token(req)); res.json(await orders.confirmPayment(o.id, true));
  });
  app.post('/api/orders/:id/service-input',async(req,res)=>{
    const order=orders.authorize(req.params.id as string,token(req));
    res.json(await orders.submitServiceInput(order,submitServiceInputSchema.parse(req.body)));
  });
  app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60000, limit: 8, message: { error: '登录尝试过多，请 15 分钟后重试', code: 'RATE_LIMITED' } }), (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(256) }).parse(req.body);
    if (!timingSafeEqual(scryptSync(password, adminSalt, 32), passwordHash)) throw new AppError(401, '密码不正确', 'INVALID_PASSWORD');
    const secret = randomBytes(32).toString('hex');
    store.run('DELETE FROM sessions WHERE expires_at<?', Date.now());
    store.run('INSERT INTO sessions VALUES (?,?)', hash(secret), Date.now() + 12 * 3600000);
    res.cookie('subnest_admin', secret, { httpOnly: true, secure: config.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/admin', maxAge: 12 * 3600000 });
    res.json({ ok: true });
  });
  app.use('/api/admin', admin);
  app.post('/api/admin/logout', (req, res) => { store.run('DELETE FROM sessions WHERE token_hash=?', hash(req.cookies.subnest_admin)); res.clearCookie('subnest_admin', { path: '/api/admin' }); res.json({ ok: true }); });
  app.get('/api/admin/dashboard', (_req, res) => {
    const stats = store.get("SELECT COUNT(*) AS total, SUM(CASE WHEN payment_status='paid' THEN total_cents ELSE 0 END) AS revenueCents, SUM(CASE WHEN status='payment_review' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='needs_attention' THEN 1 ELSE 0 END) AS attention FROM orders WHERE payment_mode=?", config.PAYMENT_MODE);
    const psStats = store.get<{total:number;enabled:number;in_stock:number}>("SELECT COUNT(*) AS total, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled, SUM(CASE WHEN in_stock=1 THEN 1 ELSE 0 END) AS in_stock FROM products WHERE provider='prodseller' AND source_mode=?", config.PRODSELLER_MODE) ?? { total: 0, enabled: 0, in_stock: 0 };
    res.json({ stats, mode: config.PRODSELLER_MODE, paymentMode: config.PAYMENT_MODE, exchangeRate: config.USDT_CNY_RATE, markupPercent: config.MARKUP_PERCENT, storeSettings, providers: [...providers.keys()], prodseller: { ...prodsellerMeta, hasKey: config.PRODSELLER_MODE === 'live' && !!config.PRODSELLER_API_KEY, productCount: psStats.total || 0, enabledProductCount: psStats.enabled || 0, inStockProductCount: psStats.in_stock || 0 }, channels: channelList(true) });
  });
  app.put('/api/admin/settings', (req, res) => {
    const input = storeSettingsSchema.extend({
      recalculatePrices: z.boolean().optional().default(false),
      clearPriceOverrides: z.boolean().optional().default(false),
    }).parse(req.body);
    const { recalculatePrices, clearPriceOverrides, ...nextSettings } = input;
    const rateOrMarkupChanged = nextSettings.exchangeRate !== config.USDT_CNY_RATE || nextSettings.markupPercent !== config.MARKUP_PERCENT;
    storeSettings = nextSettings;
    config.STORE_NAME = nextSettings.storeName;
    config.USDT_CNY_RATE = nextSettings.exchangeRate;
    config.MARKUP_PERCENT = nextSettings.markupPercent;
    config.SUPPORT_EMAIL = nextSettings.supportEmail;
    config.SUPPORT_WECHAT = nextSettings.supportWechat;
    config.SUPPORT_TELEGRAM = nextSettings.supportTelegram;
    store.run("INSERT INTO settings(name,value) VALUES ('store_settings',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", store.encrypt(storeSettings));
    let recalculated = 0;
    if (recalculatePrices || clearPriceOverrides || rateOrMarkupChanged) {
      recalculated = catalog.recalculatePrices(undefined, clearPriceOverrides);
    }
    store.audit('settings.update', 'store_settings');
    res.json({ ok: true, storeSettings, recalculated });
  });
  app.get('/api/admin/balance', async (_req, res) => res.json(await providers.get('prodseller')!.balance()));
  app.get('/api/admin/suppliers', (_req,res)=>res.json({suppliers:customProviders.list()}));
  app.post('/api/admin/suppliers', rateLimit({windowMs:15*60000,limit:12}), async(req,res)=>res.status(201).json(await customProviders.save(customSupplierSchema.parse(req.body))));
  app.put('/api/admin/suppliers/:id', async(req,res)=>res.json(await customProviders.save(customSupplierSchema.parse(req.body),req.params.id as string)));
  app.patch('/api/admin/suppliers/:id/toggle', async(req,res)=>{const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);res.json(await customProviders.toggle(req.params.id as string,enabled));});
  app.post('/api/admin/suppliers/:id/test',async(req,res)=>res.json(await customProviders.test(req.params.id as string)));
  app.get('/api/admin/suppliers/:id/balance',async(req,res)=>res.json(await customProviders.balance(req.params.id as string)));
  app.delete('/api/admin/suppliers/:id',(req,res)=>{customProviders.remove(req.params.id as string);res.json({ok:true});});
  let connectingSupplier = false;
  app.post('/api/admin/providers/prodseller', rateLimit({ windowMs: 15 * 60000, limit: 15, message: { error: '连接尝试过多，请稍后重试', code: 'RATE_LIMITED' } }), async (req, res) => {
    const input = z.object({
      apiKey: z.string().trim().max(256).regex(/^[\x21-\x7e]*$/).default(''),
      name: z.string().trim().min(1).max(80).optional(),
      baseUrl: customSupplierSchema.shape.baseUrl.optional(),
      authHeader: customSupplierSchema.shape.authHeader.optional(),
      authPrefix: customSupplierSchema.shape.authPrefix.optional(),
      paths: supplierPathsSchema.optional(),
      enabled: z.boolean().optional(),
      markupPercent: z.number().min(0).max(1000).nullable().optional(),
      autoEnable: z.boolean().optional(),
    }).parse(req.body);
    const apiKey = input.apiKey || (config.PRODSELLER_MODE === 'live' ? config.PRODSELLER_API_KEY : '');
    if (apiKey.length < 8) throw new AppError(400, '请填写有效的 API Key', 'VALIDATION_ERROR');
    const nextMeta = {
      name: input.name ?? prodsellerMeta.name,
      baseUrl: input.baseUrl ?? prodsellerMeta.baseUrl,
      authHeader: input.authHeader ?? prodsellerMeta.authHeader,
      authPrefix: input.authPrefix ?? prodsellerMeta.authPrefix,
      paths: input.paths ?? prodsellerMeta.paths,
      enabled: input.enabled ?? prodsellerMeta.enabled,
      markupPercent: input.markupPercent !== undefined ? input.markupPercent : prodsellerMeta.markupPercent,
      autoEnable: input.autoEnable ?? prodsellerMeta.autoEnable,
    };
    if (connectingSupplier) throw new AppError(409, '正在连接供应商，请稍后重试', 'SUPPLIER_BUSY');
    connectingSupplier = true;
    try {
      const connectionChanged = config.PRODSELLER_MODE !== 'live' || apiKey !== config.PRODSELLER_API_KEY || nextMeta.baseUrl !== prodsellerMeta.baseUrl || nextMeta.authHeader !== prodsellerMeta.authHeader || nextMeta.authPrefix !== prodsellerMeta.authPrefix || JSON.stringify(nextMeta.paths) !== JSON.stringify(prodsellerMeta.paths);
      const markupChanged = nextMeta.markupPercent !== prodsellerMeta.markupPercent;
      const encrypted = store.encrypt({ apiKey, ...nextMeta });
      if (!connectionChanged) {
        store.run("INSERT INTO settings(name,value) VALUES ('prodseller',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", encrypted);
        store.audit('supplier.update', 'prodseller');
        prodsellerMeta = nextMeta;
        if (markupChanged) catalog.recalculatePrices('prodseller');
        return res.json({ ok: true, count: store.get<{n:number}>("SELECT COUNT(*) AS n FROM products WHERE provider='prodseller' AND source_mode='live'")?.n ?? 0 });
      }
      const candidate = providerFactory(apiKey, nextMeta);
      // This request only reads the catalog. It never places an order or spends balance.
      const products = await candidate.products();
      const count = catalog.applySnapshot('prodseller', 'live', products, () => {
        store.run("INSERT INTO settings(name,value) VALUES ('prodseller',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", encrypted);
        store.audit('supplier.connect', 'prodseller');
      });
      config.PRODSELLER_API_KEY = apiKey;
      config.PRODSELLER_MODE = 'live';
      config.PAYMENT_MODE = 'manual';
      prodsellerMeta = nextMeta;
      providers.set('prodseller', candidate);
      res.json({ ok: true, count });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SUPPLIER_401') throw new AppError(400, 'API Key 无效或已停用，请在 ProdSeller API Manager 核对', 'SUPPLIER_AUTH');
      throw error;
    } finally { connectingSupplier = false; }
  });
  app.patch('/api/admin/providers/prodseller/toggle', (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    prodsellerMeta = { ...prodsellerMeta, enabled };
    store.run("INSERT INTO settings(name,value) VALUES ('prodseller_prefs',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", store.encrypt({ enabled: prodsellerMeta.enabled, markupPercent: prodsellerMeta.markupPercent, autoEnable: prodsellerMeta.autoEnable }));
    if (config.PRODSELLER_MODE === 'live' && config.PRODSELLER_API_KEY) {
      store.run("INSERT INTO settings(name,value) VALUES ('prodseller',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", store.encrypt({ apiKey: config.PRODSELLER_API_KEY, ...prodsellerMeta }));
    }
    store.audit(enabled ? 'supplier.enable' : 'supplier.disable', 'prodseller');
    res.json({ ok: true, enabled });
  });
  app.get('/api/admin/products', (_req, res) => res.json({ products: catalog.list(true) }));
  app.patch('/api/admin/products/:id/toggle', (req, res) => {
    const p = catalog.product(req.params.id as string);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    store.run('UPDATE products SET enabled=?, updated_at=? WHERE id=?', +enabled, new Date().toISOString(), p.id);
    store.audit(enabled ? 'product.enable' : 'product.disable', p.id);
    res.json({ ok: true, id: p.id, enabled });
  });
  app.post('/api/admin/products/batch', (req, res) => {
    const input = z.object({
      action: z.enum(['enable', 'disable', 'reset_price_override']),
      ids: z.array(z.string().min(1).max(220)).max(5000).optional(),
      provider: z.string().max(120).optional(),
    }).parse(req.body);
    const now = new Date().toISOString();
    let count = 0;
    store.transaction(() => {
      if (input.action === 'reset_price_override') {
        count = catalog.recalculatePrices(input.provider && input.provider !== 'all' ? input.provider : undefined, true);
      } else {
        const nextEnabled = input.action === 'enable' ? 1 : 0;
        if (input.ids && input.ids.length > 0) {
          const stmt = store.db.prepare('UPDATE products SET enabled=?, updated_at=? WHERE id=?');
          for (const id of input.ids) count += Number(stmt.run(nextEnabled, now, id).changes);
        } else if (input.provider && input.provider !== 'all') {
          count = Number(store.run('UPDATE products SET enabled=?, updated_at=? WHERE provider=?', nextEnabled, now, input.provider).changes);
        } else {
          count = Number(store.run('UPDATE products SET enabled=?, updated_at=?', nextEnabled, now).changes);
        }
      }
      store.audit(`product.batch.${input.action}`, input.provider || `${input.ids?.length ?? 0} items`);
    });
    res.json({ ok: true, count });
  });
  app.post('/api/admin/sync', async (req, res) => {
    const { provider } = z.object({ provider: z.string().default('prodseller') }).parse(req.body);
    if(provider!=='prodseller'&&!store.get<{enabled:number}>('SELECT enabled FROM supplier_connections WHERE id=?',provider)?.enabled)throw new AppError(400,'请先启用供应商');
    res.json({ count: await catalog.sync(provider) });
  });
  app.post('/api/admin/products', (req, res) => { const id = catalog.create(customProductSchema.parse(req.body)); res.status(201).json({ id }); });
  app.patch('/api/admin/products/:id', (req, res) => {
    const p = catalog.product(req.params.id as string);
    const input = z.object({ name: z.string().min(1).max(100), nameEn: z.string().max(100), description: z.string().min(1).max(4000), descriptionEn: z.string().max(4000), priceCents: z.number().int().min(1).max(10000000), category: z.enum(['ai','streaming','design','tools','gaming','services','vpn']), enabled: z.boolean(), inStock: z.boolean().optional() }).parse(req.body);
    const nextInStock = input.inStock === undefined ? p.in_stock : +input.inStock;
    store.run('UPDATE products SET name=?,name_en=?,description=?,description_en=?,price_cents=?,price_override=?,category=?,enabled=?,in_stock=?,updated_at=? WHERE id=?', input.name, input.nameEn, input.description, input.descriptionEn, input.priceCents, input.priceCents, input.category, +input.enabled, nextInStock, new Date().toISOString(), p.id);
    store.audit('product.update', p.id); res.json({ ok: true });
  });
  app.post('/api/admin/products/:id/inventory', (req, res) => {
    const p = catalog.product(req.params.id as string);
    if (p.provider !== 'local' || p.delivery !== 'instant') throw new AppError(400, '只能给自营自动交付商品导入库存');
    const { keys } = z.object({ keys: z.array(z.string().trim().min(1).max(4000)).min(1).max(1000) }).parse(req.body);
    let count = 0;
    store.transaction(() => { for (const key of keys) count += Number(store.run('INSERT OR IGNORE INTO inventory(product_id,secret,secret_hash) VALUES (?,?,?)', p.id, store.encrypt(key), hash(key)).changes); });
    store.audit('inventory.import', p.id); res.json({ count });
  });
  app.get('/api/admin/orders', (req, res) => {
    const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(req.query.page);
    const total = store.get<{n:number}>('SELECT COUNT(*) AS n FROM orders')!.n;
    res.json({ orders: store.all<OrderRow>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 30 OFFSET ?', (page - 1) * 30).map(o => orders.view(o, true)), page, pages: Math.ceil(total / 30), total });
  });
  app.post('/api/admin/orders/:id/confirm', async (req, res) => {
    z.object({ confirmed: z.literal(true) }).parse(req.body);
    res.json(await orders.confirmPayment(req.params.id as string));
  });
  app.post('/api/admin/orders/:id/retry', async (req, res) => {
    await orders.fulfill(req.params.id as string); store.audit('order.retry', req.params.id as string); res.json(orders.view(orders.get(req.params.id as string), true));
  });
  app.post('/api/admin/orders/:id/reconcile',async(req,res)=>{
    const {supplierOrderId}=z.object({supplierOrderId:z.string().trim().min(1).max(200),confirmed:z.literal(true)}).parse(req.body);
    await orders.reconcile(req.params.id as string,supplierOrderId);res.json(orders.view(orders.get(req.params.id as string),true));
  });
  app.post('/api/admin/orders/:id/deliver', (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(20000) }).parse(req.body);
    orders.manualDelivery(req.params.id as string, text); res.json({ ok: true });
  });
  app.put('/api/admin/channels/:id', (req, res) => {
    const id = z.enum(['alipay','wechat','bank','binance']).parse(req.params.id);
    const input = z.object({ enabled: z.boolean(), instructions: z.string().max(4000), instructionsEn: z.string().max(4000).default(''), qrUrl: z.union([z.literal(''), z.url().refine(v => v.startsWith('https://'))]).default('') }).parse(req.body);
    if (input.enabled && !input.instructions.trim()) throw new AppError(400, '启用前请填写收款账号、币种与核款说明');
    store.run('UPDATE channels SET enabled=?,instructions=?,instructions_en=?,qr_url=? WHERE id=?', +input.enabled, input.instructions, input.instructionsEn, input.qrUrl, id);
    store.audit('channel.update', id); res.json({ ok: true });
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, '接口不存在')));
  app.use((req, res, next) => {
    if (/(\/\.env|\/\.git|\.sqlite|\/server\/|\/data\/)/i.test(req.path)) return res.status(404).end();
    next();
  });
  const dist = resolve('dist');
  if (existsSync(dist)) { app.use(express.static(dist, { index: false, dotfiles: 'deny' })); app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html'))); }
  const runtimeSecrets = () => [config.PRODSELLER_API_KEY, config.ADMIN_PASSWORD, config.DATA_ENCRYPTION_KEY, config.AIPAY_PRIVATE_KEY, config.AIPAY_PRIVATE_PKCS_KEY];
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: '输入格式不正确，请检查必填项、邮箱与金额', code: 'VALIDATION_ERROR' });
    if (err instanceof AppError) return res.status(err.status).json({ error: redactSecrets(err.message, runtimeSecrets()), code: err.code });
    if (err instanceof SyntaxError) return res.status(400).json({ error: '无效 JSON', code: 'VALIDATION_ERROR' });
    console.error('Request failed:', err instanceof Error ? redactSecrets(err.name, runtimeSecrets()) : 'UnknownError');
    res.status(500).json({ error: '服务暂时不可用，请稍后重试', code: 'INTERNAL_ERROR' });
  });
  return { app, store, catalog, orders, customProviders, alipay };
}
