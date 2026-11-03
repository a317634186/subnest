import { z } from 'zod';
import { isIP } from 'node:net';
import { AppError, type Supplier, type SupplierOrder, type SupplierProduct } from './types.js';
import { publicHttpsFetch } from './public-https.js';

const path = z.string().max(300).regex(/^\/(?!\/)[^\s#?\\]*$/, '请输入以 / 开头且不含查询参数的接口路径');
const hostUrl = z.url().max(500).refine(value => {
  const url = new URL(value); const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (!url.port || url.port === '443') && !isIP(host) && host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost') && !host.endsWith('.internal');
}, '请输入不包含账号、参数的公网 HTTPS 域名');
const header = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/).refine(name => !/^(host|connection|content-length|content-type|transfer-encoding|cookie|origin|idempotency-key|proxy-.*|x-forwarded-.*)$/i.test(name), '不可使用此请求头');
export const supplierPathsSchema = z.object({
  products: path.default('/products'), product: path.refine(s => s.includes('{productId}')).default('/products/{productId}'),
  orders: path.default('/orders'), order: path.refine(s => s.includes('{orderId}')).default('/orders/{orderId}'),
  balance: z.union([path, z.literal('')]).default('/balance'),
});
export const customSupplierSchema = z.object({
  name: z.string().trim().min(1).max(80), baseUrl: hostUrl,
  type: z.enum(['compatible', 'quantumvault', 'partner_jobs']).default('compatible'),
  authHeader: header.default('X-API-Key'), authPrefix: z.string().max(30).regex(/^[\x20-\x7e]*$/).default(''),
  apiKey: z.string().trim().max(256).regex(/^[\x21-\x7e]*$/).default(''),
  paths: supplierPathsSchema, enabled: z.boolean().default(true), supportsIdempotency: z.boolean().default(false),
  coinToCny:z.number().positive().max(100000).default(1),
  markupPercent:z.number().min(0).max(1000).nullable().optional().default(null),
  autoEnable:z.boolean().optional().default(true),
});
export type CustomSupplierConfig = z.infer<typeof customSupplierSchema>;
const messages: Record<number,string> = { 400:'供应商拒绝订单参数',401:'供应商 API Key 无效或已停用',402:'供应商余额不足',404:'供应商商品或订单不存在',409:'供应商库存不足',429:'供应商请求繁忙' };

export class CompatibleSupplier implements Supplier {
  private nextRequestAt = 0;
  get supportsIdempotency() { return this.settings.supportsIdempotency; }
  get maxQuantity() { return this.settings.supportsIdempotency ? 20 : 1; }
  constructor(private settings: CustomSupplierConfig, private transport: typeof fetch = publicHttpsFetch, private intervalMs = 3300) {}
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const wait = Math.max(0, this.nextRequestAt - Date.now());
    if (wait > 30000) throw new AppError(503, '供应商请求繁忙，请稍后重试', 'SUPPLIER_BUSY');
    this.nextRequestAt = Date.now() + wait + this.intervalMs;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    try {
      const response = await this.transport(`${this.settings.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { [this.settings.authHeader]: `${this.settings.authPrefix}${this.settings.apiKey}`, 'Content-Type': 'application/json', ...init.headers },
      });
      if (!response.ok) throw new AppError(502, messages[response.status] ?? '供应商暂时不可用，请稍后重试', `SUPPLIER_${response.status}`);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, '供应商连接暂时中断，订单会保留以便处理', 'SUPPLIER_UNAVAILABLE');
    }
  }
  async products() { return (await this.request<{products:SupplierProduct[]}>(this.settings.paths.products)).products; }
  product(id: string) { return this.request<SupplierProduct>(this.settings.paths.product.replaceAll('{productId}', encodeURIComponent(id))); }
  balance() { if (!this.settings.paths.balance) throw new AppError(400, '此供应商未配置余额接口'); return this.request<{balance:number;membership:string}>(this.settings.paths.balance); }
  purchase(input:{productId:string;quantity:number;email?:string;emails?:string[]}, key:string) {
    return this.request<SupplierOrder>(this.settings.paths.orders, { method:'POST', headers: this.settings.supportsIdempotency ? { 'Idempotency-Key': key } : {}, body:JSON.stringify(input) });
  }
  order(id:string) { return this.request<SupplierOrder>(this.settings.paths.order.replaceAll('{orderId}', encodeURIComponent(id))); }
  orders(page=1) { const p=this.settings.paths.orders; return this.request(`${p}${p.includes('?')?'&':'?'}page=${page}&limit=50`); }
}
