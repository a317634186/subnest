import { z } from 'zod';
import { AppError, type Supplier, type SupplierProduct, type SupplierOrder } from './types.js';
import { publicHttpsFetch } from './public-https.js';

const variant = z.object({ key:z.string().min(1), name:z.string().optional(), price:z.number().finite().nonnegative(), description:z.string().nullish(), stock:z.number().nullish(), unlimited:z.boolean().optional(), inStock:z.boolean().optional() });
const product = z.object({ productKey:z.string().min(1), name:z.string().min(1), description:z.string().nullish(), currency:z.string().default('USD'), price:z.number().finite().nonnegative().nullish(), variants:z.array(variant).nullish(), stock:z.number().nullish(), unlimited:z.boolean().optional(), inStock:z.boolean().optional(), acquisitionMode:z.string().optional() });
type QVProduct = z.infer<typeof product>;
const reference = z.tuple([z.string().min(1), z.string().nullable()]);
const encode = (p:string, v:string|null) => Buffer.from(JSON.stringify([p,v])).toString('base64url');
function decode(id:string) {
  try { return reference.parse(JSON.parse(Buffer.from(id,'base64url').toString('utf8'))); }
  catch { throw new AppError(400, '供应商商品编号无效', 'VALIDATION_ERROR'); }
}
function normalize(p:QVProduct):SupplierProduct[] {
  if (p.currency !== 'USD' || (p.acquisitionMode && p.acquisitionMode !== 'paid')) return [];
  const options = p.variants?.length ? p.variants : [null];
  return options.flatMap(v => {
    const price = v ? v.price : p.price;
    const id = encode(p.productKey, v?.key ?? null);
    if (price == null || id.length > 190) return [];
    const available = v ? (v.inStock ?? (v.unlimited === true || (v.stock ?? 0) > 0)) : (p.inStock ?? (p.unlimited === true || (p.stock ?? 0) > 0));
    return [{ id, name: `${p.name}${v?.name ? ` · ${v.name}` : ''}`.slice(0,200), description: v?.description || p.description || '', price, inStock:available, stock:v ? v.stock ?? null : p.stock ?? null, delivery:{type:'instant'}, requiresEmailActivation:false }];
  });
}
type Delivered = { orderId?:unknown; purchaseId?:unknown; productKey?:unknown; variantKey?:unknown; fields?:unknown; data?:unknown };
function delivery(item:Delivered):SupplierOrder {
  const orderId=typeof item.orderId==='string' ? item.orderId : typeof item.purchaseId==='string' ? item.purchaseId : '';
  if (!orderId || typeof item.productKey !== 'string' || (item.variantKey != null && typeof item.variantKey !== 'string')) throw new AppError(502, '供应商订单响应格式异常，请核对订单后处理', 'SUPPLIER_RESPONSE');
  let lines:string[]=[];
  if (Array.isArray(item.fields)) lines=item.fields.map((f:unknown)=>{
    if (!f || typeof f!=='object') return '';
    const data=f as {label?:unknown;name?:unknown;value?:unknown};
    const label=typeof data.label==='string' ? data.label : typeof data.name==='string' ? data.name : '';
    const value=typeof data.value==='string' ? data.value : data.value==null ? '' : JSON.stringify(data.value);
    return value ? `${label ? `${label}: ` : ''}${value}` : '';
  }).filter(Boolean);
  if (!lines.length && item.data && typeof item.data==='object' && !Array.isArray(item.data)) lines=Object.entries(item.data).map(([key,value])=>`${key}: ${typeof value==='string'?value:JSON.stringify(value)}`);
  if (!lines.length) throw new AppError(502, '供应商未返回交付内容，请核对订单后处理', 'SUPPLIER_RESPONSE');
  return {orderId,status:'delivered',product:{id:encode(item.productKey,item.variantKey ?? null),name:''},quantity:1,deliveredKeys:[lines.join('\n')]};
}
export class QuantumVault implements Supplier {
  readonly supportsIdempotency=false;
  readonly maxQuantity=1;
  // QuantumVault documents that failed non-2xx purchases are not charged.
  readonly noChargeOnHttpError=[400,401,403,404,409,429,503] as const;
  private nextRequestAt=0;
  constructor(private baseUrl:string, private apiKey:string, private transport:typeof fetch=publicHttpsFetch, private intervalMs=600, private authHeader="X-API-Key", private authPrefix="") {}
  private async request<T>(path:string, init:RequestInit={}):Promise<T> {
    const wait=Math.max(0,this.nextRequestAt-Date.now()); if(wait>30000)throw new AppError(503,'供应商请求繁忙','SUPPLIER_BUSY');
    this.nextRequestAt=Date.now()+wait+this.intervalMs;if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    try {
      const response=await this.transport(`${this.baseUrl.replace(/\/$/,'')}${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(20000),headers:{[this.authHeader||"X-API-Key"]:`${this.authPrefix??""}${this.apiKey}`,'Content-Type':'application/json',...init.headers}});
      if(!response.ok)throw new AppError(502,({400:'供应商拒绝订单或余额不足',401:'供应商密钥无效或已停用',403:'供应商账号不可用',404:'供应商商品或订单不存在',409:'供应商库存不足',429:'供应商请求繁忙'} as Record<number,string>)[response.status]??'供应商暂时不可用',`SUPPLIER_${response.status}`);
      return await response.json() as T;
    } catch(error) { if(error instanceof AppError)throw error;throw new AppError(502,'供应商连接暂时中断，请核对订单后处理','SUPPLIER_UNAVAILABLE'); }
  }
  async products(){const result=await this.request<{products:unknown[]}>('/products');return z.array(product).parse(result.products).flatMap(normalize);}
  async product(id:string){const [key]=decode(id);const result=await this.request<{product:unknown}>(`/products/${encodeURIComponent(key)}`);const match=normalize(product.parse(result.product)).find(p=>p.id===id);if(!match)throw new AppError(404,'供应商商品或规格不存在','SUPPLIER_404');return match;}
  async balance(){const data=await this.request<{balance:number;currency?:string}>('/balance');return {balance:data.balance,membership:data.currency??'USD'};}
  async purchase(input:{productId:string;quantity:number}, _key:string){
    if(input.quantity!==1)throw new AppError(400,'此供应商单次只支持购买一件','VALIDATION_ERROR');
    const [productKey,variantKey]=decode(input.productId);
    const result=await this.request<{success?:boolean;order?:{fulfilled?:number;items?:Delivered[]}}>('/purchase',{method:'POST',body:JSON.stringify({productKey,...(variantKey?{variantKey}:{}),quantity:1})});
    if(!result.success || result.order?.fulfilled!==1 || result.order.items?.length!==1)throw new AppError(502,'供应商未完整交付，请核对订单后处理','SUPPLIER_RESPONSE');
    const output=delivery(result.order.items[0]);
    if(output.product?.id!==input.productId)throw new AppError(502,'供应商交付商品不匹配，请核对订单后处理','SUPPLIER_RESPONSE');
    return output;
  }
  async order(id:string){const result=await this.request<{order:Delivered}>(`/orders/${encodeURIComponent(id)}`);return delivery(result.order);}
  async orders(){return this.request('/orders?limit=100');}
}
