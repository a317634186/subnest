import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store, hash, type OrderRow } from './store.js';
import { Catalog } from './catalog.js';
import type { Config } from './config.js';
import { AppError, type ServiceInput, type SupplierOrder } from './types.js';
import { serviceSubjectHash, sheerId } from './partner-jobs.js';
export const checkoutSchema = z.object({
  checkoutId: z.uuid(), accessToken: z.string().regex(/^[a-f0-9]{64}$/), productId: z.string().min(1).max(250),
  quantity: z.number().int().min(1).max(20), email: z.email().max(254),
  activationEmails: z.array(z.email().max(254)).max(20).default([]),
  paymentChannel: z.enum(['alipay', 'wechat', 'bank', 'binance']),
  expectedUnitPrice: z.number().int().positive(),
});
const serviceInputSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('pixel'),gmail:z.email().max(254).refine(v=>/@gmail\.com$/i.test(v)).transform(v=>v.toLowerCase()),password:z.string().min(1).max(256),totp:z.string().transform(v=>v.replace(/\s+/g,'').toUpperCase()).pipe(z.string().regex(/^[A-Z2-7]{32}$/)),backupCodes:z.array(z.string().regex(/^\d{8}$/)).max(3).refine(v=>v.length===0||v.length>=2)}),
  z.object({kind:z.literal('sheerid'),link:z.url().max(2000).refine(v=>{try{sheerId(v);return true;}catch{return false;}})}),
]);
export const submitServiceInputSchema=z.object({serviceInput:serviceInputSchema,serviceConsent:z.literal(true)});
interface PrivateData { email: string; activationEmails: string[]; paymentReference?: string; serviceInput?:ServiceInput; serviceSubjectHash?:string; serviceConsentAt?:string; serviceAccount?:string }
interface DeliveryData { keys: string[]; instructions: string[]; eta?: string }
const instructionStrings = (data: unknown[]) => data.map(v => typeof v === 'string' ? v : JSON.stringify(v));
export class Orders {
  constructor(public store: Store, public catalog: Catalog, private config: Config) {}
  get(id: string) {
    const order = this.store.get<OrderRow>('SELECT * FROM orders WHERE id=?', id);
    if (!order) throw new AppError(404, '订单不存在或查询密钥不正确', 'ORDER_NOT_FOUND');
    return order;
  }
  authorize(id: string, token?: string) {
    const order = this.get(id);
    if (!token || hash(token) !== order.token_hash) throw new AppError(404, '订单不存在或查询密钥不正确', 'ORDER_NOT_FOUND');
    return order;
  }
  view(o: OrderRow, admin = false) {
    const privateData = this.store.decrypt<PrivateData>(o.private_data);
    const delivery = o.delivery_data ? this.store.decrypt<DeliveryData>(o.delivery_data) : { keys: [], instructions: [] };
    const inputKind=this.store.get<{input_kind:string}>('SELECT input_kind FROM products WHERE id=?',o.product_id)?.input_kind??'';
    return { id: o.id, productName: o.product_name, quantity: o.quantity, totalCents: o.total_cents, inputKind,
      status: o.status, paymentStatus: o.payment_status, paymentChannel: o.payment_channel,
      demo: o.payment_mode === 'demo', email: privateData.email, activationEmails: privateData.activationEmails,
      paymentReference: privateData.paymentReference ?? '', createdAt: o.created_at, updatedAt: o.updated_at,
      keys: o.status === 'delivered' ? delivery.keys : [], instructions: delivery.instructions, eta: delivery.eta,
      ...(admin ? { provider: o.provider, supplierOrderId: o.supplier_order_id, lastError: o.last_error, attempts: o.attempts, serviceAccount:privateData.serviceAccount, canReconcile:o.status==='needs_attention' && !!o.purchase_started && !o.supplier_order_id && this.catalog.providers.get(o.provider)?.supportsIdempotency===false } : {}),
    };
  }
  async submitServiceInput(o:OrderRow, data:z.infer<typeof submitServiceInputSchema>) {
    const p=this.catalog.product(o.product_id);
    if(o.payment_status!=='paid'||o.status!=='awaiting_input'||!p.input_kind||p.input_kind!==data.serviceInput.kind)throw new AppError(409,'此订单当前不需要提交任务资料','ORDER_NOT_READY');
    const priv=this.store.decrypt<PrivateData>(o.private_data);
    priv.serviceInput=data.serviceInput;priv.serviceSubjectHash=serviceSubjectHash(data.serviceInput);priv.serviceConsentAt=new Date().toISOString();
    if(data.serviceInput.kind==='pixel')priv.serviceAccount=data.serviceInput.gmail;
    const result=this.store.run("UPDATE orders SET private_data=?,status='paid',updated_at=? WHERE id=? AND status='awaiting_input' AND payment_status='paid'",this.store.encrypt(priv),new Date().toISOString(),o.id);
    if(!result.changes)throw new AppError(409,'任务资料已提交，请刷新订单','ORDER_BUSY');
    await this.fulfill(o.id);
    return this.view(this.get(o.id));
  }
  private scrubServiceInput(id:string){
    const row=this.get(id);const data=this.store.decrypt<PrivateData>(row.private_data);
    if(data.serviceInput){delete data.serviceInput;this.store.run('UPDATE orders SET private_data=? WHERE id=?',this.store.encrypt(data),id);}
  }
  create(input: z.infer<typeof checkoutSchema>) {
    const { accessToken, ...details } = input; const fingerprint = hash(JSON.stringify(details));
    const existing = this.store.get<OrderRow>('SELECT * FROM orders WHERE checkout_id=?', input.checkoutId);
    if (existing) {
      if (existing.token_hash !== hash(accessToken) || existing.fingerprint !== fingerprint) throw new AppError(409, '重复请求内容不同，请重新下单', 'CHECKOUT_CONFLICT');
      return this.view(existing);
    }
    const p = this.catalog.product(input.productId); const publicProduct = this.catalog.publicProduct(p);
    const expectedMode = p.provider === 'prodseller' ? this.config.PRODSELLER_MODE : 'live';
    if (p.provider !== 'local' && p.source_mode !== expectedMode) throw new AppError(409, '商品来源模式不匹配，请重新同步商品', 'PRODUCT_NOT_FOUND');
    if (p.provider === 'prodseller' && !this.catalog.prodsellerEnabled()) throw new AppError(409, '供应商已停用', 'OUT_OF_STOCK');
    if (p.provider !== 'local' && p.provider !== 'prodseller' && !this.store.get<{enabled:number}>('SELECT enabled FROM supplier_connections WHERE id=?', p.provider)?.enabled) throw new AppError(409, '供应商已停用', 'OUT_OF_STOCK');
    if (p.provider !== 'local' && input.quantity > (this.catalog.providers.get(p.provider)?.maxQuantity ?? 20)) throw new AppError(400, '此商品每次只能购买一件', 'VALIDATION_ERROR');
    if (!p.enabled || !publicProduct.inStock || (publicProduct.stock !== null && publicProduct.stock < input.quantity)) throw new AppError(409, '商品库存不足', 'OUT_OF_STOCK');
    if (p.price_cents !== input.expectedUnitPrice) throw new AppError(409, '商品价格已更新，请刷新后重新下单', 'PRICE_CHANGED');
    if (p.requires_email && input.activationEmails.length !== input.quantity) throw new AppError(400, '每份商品需要填写一个开通邮箱', 'ACTIVATION_EMAILS_REQUIRED');
    if (p.provider !== 'local' && p.source_mode === 'demo' && this.config.PAYMENT_MODE !== 'demo') throw new AppError(409, '演示商品不能真实收款', 'DEMO_PRODUCT');
    if (p.provider !== 'local' && p.source_mode === 'live' && this.config.PAYMENT_MODE === 'demo') throw new AppError(409, '真实商品不能使用演示付款', 'DEMO_DISABLED');
    if (this.config.PAYMENT_MODE !== 'demo') {
      const ch = this.store.get<{enabled:number;instructions:string}>('SELECT * FROM channels WHERE id=?', input.paymentChannel);
      if (!ch?.enabled || !ch.instructions.trim()) throw new AppError(400, '该支付渠道暂未开通', 'PAYMENT_UNAVAILABLE');
    }
    const id = randomUUID(); const now = new Date().toISOString();
    this.store.run(`INSERT INTO orders(id,checkout_id,token_hash,fingerprint,product_id,product_name,provider,source_id,source_mode,payment_mode,quantity,unit_price_cents,total_cents,cost_usdt,payment_channel,private_data,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, input.checkoutId, hash(accessToken), fingerprint,
      p.id, p.name, p.provider, p.source_id, p.provider === 'local' ? this.config.PRODSELLER_MODE : p.source_mode, this.config.PAYMENT_MODE,
      input.quantity, p.price_cents, p.price_cents * input.quantity, p.cost_usdt, input.paymentChannel,
      this.store.encrypt({ email: input.email, activationEmails: p.requires_email ? input.activationEmails : [] }), now, now);
    return this.view(this.get(id));
  }
  submitPayment(o: OrderRow, reference: string) {
    if (o.payment_status === 'paid') return this.view(o);
    const priv = this.store.decrypt<PrivateData>(o.private_data); priv.paymentReference = reference;
    this.store.run("UPDATE orders SET private_data=?, payment_status='submitted', status='payment_review', updated_at=? WHERE id=? AND payment_status IN ('unpaid','submitted')", this.store.encrypt(priv), new Date().toISOString(), o.id);
    return this.view(this.get(o.id));
  }
  async confirmPayment(id: string, demo = false) {
    const o = this.get(id);
    if (demo && (o.payment_mode !== 'demo' || this.config.PAYMENT_MODE !== 'demo' || this.config.PRODSELLER_MODE !== 'demo')) throw new AppError(403, '演示付款不可用', 'DEMO_DISABLED');
    if (o.status === 'cancelled') throw new AppError(409, '订单已关闭');
    if (o.payment_status !== 'paid') {
      const now = new Date().toISOString();
      this.store.run("UPDATE orders SET payment_status='paid', status='paid', paid_at=?, updated_at=? WHERE id=? AND payment_status!='paid'", now, now, id);
      this.store.audit(demo ? 'payment.demo' : 'payment.confirm', id);
    }
    await this.fulfill(id);
    return this.view(this.get(id));
  }
  private saveSupplier(id: string, result: SupplierOrder) {
    if (!result.orderId || typeof result.status !== 'string') throw new AppError(502, '供应商响应格式异常', 'SUPPLIER_RESPONSE');
    const status = result.status === 'delivered' ? 'delivered' : result.status === 'paid' || result.status === 'pending' ? 'activating' : 'needs_attention';
    const previous = this.get(id);
    const prev = previous.delivery_data ? this.store.decrypt<DeliveryData>(previous.delivery_data) : { keys: [], instructions: [] };
    const keys = result.deliveredKeys ?? (result.deliveredKey ? [result.deliveredKey] : prev.keys);
    if (!Array.isArray(keys) || keys.some(k => typeof k !== 'string')) throw new AppError(502, '供应商交付格式异常');
    const data: DeliveryData = { keys, instructions: result.activationInstructions ? instructionStrings(result.activationInstructions) : prev.instructions, eta: result.activation?.eta };
    const privateData=this.store.decrypt<PrivateData>(previous.private_data);delete privateData.serviceInput;
    this.store.run('UPDATE orders SET status=?, supplier_order_id=?, delivery_data=?, private_data=?, last_error=?, lease_until=0, last_checked=?, updated_at=? WHERE id=?',
      status, result.orderId, this.store.encrypt(data), this.store.encrypt(privateData), status === 'needs_attention' ? '供应商订单失败，请核对后退款或处理' : null, Date.now(), new Date().toISOString(), id);
  }
  async fulfill(id: string) {
    let o = this.get(id);
    if (o.payment_status !== 'paid' || ['delivered', 'cancelled', 'activating'].includes(o.status)) return;
    const now = Date.now();
    const lock = this.store.run("UPDATE orders SET lease_until=?, status='processing', attempts=attempts+1 WHERE id=? AND lease_until<? AND payment_status='paid' AND status IN ('paid','processing','needs_attention')", now + 90000, id, now);
    if (!lock.changes) return;
    o = this.get(id);
    try {
      const expectedMode = o.provider === 'prodseller' ? this.config.PRODSELLER_MODE : 'live';
      if ((o.provider !== 'local' && o.source_mode !== expectedMode) || o.payment_mode !== this.config.PAYMENT_MODE) throw new AppError(409, '运行模式已改变，请人工核对旧订单，不能跨模式采购');
      if (o.provider === 'local') {
        const p = this.catalog.product(o.product_id);
        if (o.payment_mode === 'demo' && p.delivery === 'instant') {
          this.store.run("UPDATE orders SET status='delivered',delivery_data=?,lease_until=0,updated_at=? WHERE id=?", this.store.encrypt({ keys: Array.from({length:o.quantity}, (_, i) => `DEMO-LOCAL-${id.slice(0,8)}-${i+1}`), instructions: ['演示交付 / Demo delivery. No real inventory was consumed.'] }), new Date().toISOString(), id);
          return;
        }
        if (p.delivery === 'manual') {
          this.store.run("UPDATE orders SET status='activating', lease_until=0, updated_at=? WHERE id=?", new Date().toISOString(), id);
          return;
        }
        this.store.transaction(() => {
          const rows = this.store.all<{id:number;secret:string}>('SELECT id,secret FROM inventory WHERE product_id=? AND order_id IS NULL LIMIT ?', o.product_id, o.quantity);
          if (rows.length !== o.quantity) throw new AppError(409, '自营卡密库存不足，请补充后重试');
          for (const row of rows) this.store.run('UPDATE inventory SET order_id=? WHERE id=? AND order_id IS NULL', id, row.id);
          const keys = rows.map(row => this.store.decrypt<string>(row.secret));
          this.store.run("UPDATE orders SET status='delivered',delivery_data=?,last_error=NULL,lease_until=0,updated_at=? WHERE id=?", this.store.encrypt({ keys, instructions: [] }), new Date().toISOString(), id);
        });
      } else {
        const provider = this.catalog.providers.get(o.provider);
        if (!provider) throw new AppError(400, '供应商未配置');
        if (o.purchase_started && !o.supplier_order_id && provider.supportsIdempotency === false) throw new AppError(409, '供应商不支持安全重试，请先在供货商后台核对订单，再填写供货商订单号恢复交付', 'MANUAL_RECONCILE');
        const p=this.catalog.product(o.product_id);
        const privateData=this.store.decrypt<PrivateData>(o.private_data);
        if(p.input_kind && !o.supplier_order_id && !privateData.serviceInput){
          this.store.run("UPDATE orders SET status='awaiting_input',lease_until=0,updated_at=? WHERE id=?",new Date().toISOString(),id);return;
        }
        // A timed-out POST may already have charged the balance. Retry that exact
        // checkout key, without a fresh stock/price precheck blocking reconciliation.
        if (!o.purchase_started) {
          const product = await provider.product(o.source_id);
          if (!Number.isFinite(product.price) || product.price > o.cost_usdt + 0.000001) throw new AppError(409, '供应商成本已上涨，请人工核对订单');
          if (product.inStock === false || (typeof product.stock === 'number' && product.stock < o.quantity)) throw new AppError(409, '供应商库存不足');
        }
        const priv = this.store.decrypt<PrivateData>(o.private_data);
        const input = { productId: o.source_id, quantity: o.quantity,
          ...(priv.activationEmails.length ? o.quantity === 1 ? { email: priv.activationEmails[0] } : { emails: priv.activationEmails } : {}),
          ...(priv.serviceInput?{serviceInput:priv.serviceInput}:{}) };
        this.store.run('UPDATE orders SET purchase_started=1 WHERE id=?', id);
        const result = o.supplier_order_id ? await provider.order(o.supplier_order_id) : await provider.purchase(input, `subnest-${o.id}`);
        this.saveSupplier(id, result);
      }
    } catch (e) {
      // Never retain customer task credentials after any failed attempt.
      this.scrubServiceInput(id);
      // These failures explicitly precede a purchase. Recheck price/stock next time;
      // only an ambiguous transport/server failure must replay without prechecks.
      const supplier=this.catalog.providers.get(o.provider);
      const status=e instanceof AppError ? /^SUPPLIER_(\d{3})$/.exec(e.code)?.[1] : undefined;
      const definiteNoCharge=e instanceof AppError && (e.code==='SUPPLIER_BUSY' || (!!status && (supplier?.noChargeOnHttpError?.includes(Number(status)) || (supplier?.supportsIdempotency!==false && /^(400|401|402|404|409|429)$/.test(status)))));
      if (definiteNoCharge && !o.supplier_order_id) this.store.run('UPDATE orders SET purchase_started=0 WHERE id=?', id);
      this.store.run("UPDATE orders SET status='needs_attention', last_error=?, lease_until=0, last_checked=?, updated_at=? WHERE id=?",
        e instanceof AppError ? e.message : '交付暂时中断，请核对供应商订单后重试', Date.now(), new Date().toISOString(), id);
    }
  }
  async refresh(id: string) {
    const o = this.get(id);
    if (o.status !== 'activating' || !o.supplier_order_id || o.provider === 'local' || Date.now() - o.last_checked < 15000) return;
    if (o.source_mode !== (o.provider === 'prodseller' ? this.config.PRODSELLER_MODE : 'live')) return;
    const lock = this.store.run('UPDATE orders SET last_checked=? WHERE id=? AND last_checked=?', Date.now(), id, o.last_checked);
    if (!lock.changes) return;
    try {
      const provider = this.catalog.providers.get(o.provider);
      if (provider) this.saveSupplier(id, await provider.order(o.supplier_order_id));
    } catch (e) {
      this.store.run('UPDATE orders SET last_error=? WHERE id=?', e instanceof AppError ? e.message : '暂时无法同步订单', id);
    }
  }
  async tick() {
    const rows = this.store.all<OrderRow>("SELECT * FROM orders WHERE payment_status='paid' AND (status IN ('paid','processing') OR (status='activating' AND supplier_order_id IS NOT NULL)) ORDER BY last_checked ASC LIMIT 5");
    for (const o of rows) { if (o.status === 'activating') await this.refresh(o.id); else await this.fulfill(o.id); }
  }
  async reconcile(id: string, supplierOrderId: string) {
    const o=this.get(id); const provider=this.catalog.providers.get(o.provider);
    if (o.payment_status!=='paid' || o.status!=='needs_attention' || o.provider==='local' || !o.purchase_started || o.supplier_order_id || !provider || provider.supportsIdempotency!==false) throw new AppError(409,'此订单不需要通过供货商订单号恢复');
    const now=Date.now();
    const locked=this.store.run("UPDATE orders SET lease_until=? WHERE id=? AND status='needs_attention' AND lease_until<?",now+90000,id,now);
    if(!locked.changes)throw new AppError(409,'订单正在处理，请稍后重试','ORDER_BUSY');
    try {
      const prefix=o.source_id.startsWith('pixel:')?'pixel':o.source_id.startsWith('sheerid:')?'sheerid':'';
      const reference=prefix&&/^\d{1,20}$/.test(supplierOrderId)?`${prefix}:${supplierOrderId}`:supplierOrderId;
      const result=await provider.order(reference);
      const priv=this.store.decrypt<PrivateData>(o.private_data);
      if (!['delivered','paid','pending'].includes(result.status) || result.product?.id!==o.source_id || result.quantity!==o.quantity || (priv.serviceSubjectHash && priv.serviceSubjectHash!==result.subjectHash)) throw new AppError(409,'供货商订单的商品、数量或客户资料不匹配，请重新核对', 'ORDER_MISMATCH');
      this.saveSupplier(id,result);
      this.store.audit('order.reconcile',id);
    } finally { this.store.run("UPDATE orders SET lease_until=0 WHERE id=? AND status='needs_attention'",id); }
  }
  manualDelivery(id: string, text: string) {
    const o = this.get(id);
    if (o.payment_status !== 'paid' || o.status !== 'activating' || o.provider !== 'local' || this.catalog.product(o.product_id).delivery !== 'manual') throw new AppError(409, '仅可处理已付款的自营人工交付订单');
    this.store.run("UPDATE orders SET status='delivered', delivery_data=?, updated_at=? WHERE id=?", this.store.encrypt({ keys: [], instructions: [text] }), new Date().toISOString(), id);
    this.store.audit('order.deliver', id);
  }
}
