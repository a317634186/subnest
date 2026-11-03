import { AppError, type Supplier, type SupplierProduct, type SupplierOrder } from './types.js';
import { publicHttpsFetch } from './public-https.js';
export interface ProdSellerPaths { products: string; product: string; orders: string; order: string; balance: string; }
export interface ProdSellerOptions { baseUrl?: string; authHeader?: string; authPrefix?: string; paths?: ProdSellerPaths; }
export const defaultProdSellerPaths: ProdSellerPaths = { products: '/products', product: '/products/{productId}', orders: '/orders', order: '/orders/{orderId}', balance: '/balance' };
const messages: Record<number, string> = { 400: '供应商拒绝订单参数，请联系店铺处理', 401: '供应商连接未授权，请联系店铺', 402: '供应商余额不足，店铺正在处理', 404: '供应商商品或订单不存在', 409: '商品库存不足，请联系店铺处理', 429: '供应商请求繁忙，请稍后重试' };
export class ProdSeller implements Supplier {
  private nextRequestAt = 0;
  constructor(private apiKey: string, private transport: typeof fetch = fetch, private intervalMs = 3300, private options: ProdSellerOptions = {}) {}
  private get baseUrl() { return (this.options.baseUrl || 'https://prodseller.com/v1').replace(/\/$/, ''); }
  private get paths(): ProdSellerPaths { return { ...defaultProdSellerPaths, ...this.options.paths }; }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // One server process stays below the documented 300 requests / 15 minutes.
    const wait = Math.max(0, this.nextRequestAt - Date.now());
    if (wait > 30000) throw new AppError(503, '供应商请求繁忙，请稍后重试', 'SUPPLIER_BUSY');
    this.nextRequestAt = Date.now() + wait + this.intervalMs;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const headerName = this.options.authHeader || 'X-API-Key';
    const headerPrefix = this.options.authPrefix ?? '';
    const callFetch = this.transport === fetch && this.baseUrl !== 'https://prodseller.com/v1' ? publicHttpsFetch : this.transport;
    try {
      const response = await callFetch(`${this.baseUrl}${path}`, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { [headerName]: `${headerPrefix}${this.apiKey}`, 'Content-Type': 'application/json', ...init.headers },
      });
      if (!response.ok) throw new AppError(502, messages[response.status] ?? '供应商暂时不可用，请稍后重试', `SUPPLIER_${response.status}`);
      return await response.json() as T;
    } catch (e) {
      if (e instanceof AppError) throw e;
      // Do not expose upstream bodies, credentials or delivery keys in errors/logs.
      throw new AppError(502, '供应商连接暂时中断，订单会保留以便重试', 'SUPPLIER_UNAVAILABLE');
    }
  }
  async products() { return (await this.request<{ products: SupplierProduct[] }>(this.paths.products)).products; }
  product(id: string) { return this.request<SupplierProduct>(this.paths.product.replaceAll('{productId}', encodeURIComponent(id))); }
  balance() { if (!this.paths.balance) throw new AppError(400, '此供应商未配置余额接口'); return this.request<{ balance: number; membership: string }>(this.paths.balance); }
  purchase(input: { productId: string; quantity: number; email?: string; emails?: string[] }, key: string) {
    return this.request<SupplierOrder>(this.paths.orders, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) });
  }
  order(id: string) { return this.request<SupplierOrder>(this.paths.order.replaceAll('{orderId}', encodeURIComponent(id))); }
  orders(page = 1) { const p = this.paths.orders; return this.request(`${p}${p.includes('?') ? '&' : '?'}page=${page}&limit=50`); }
}
