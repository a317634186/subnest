import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store, type SupplierConnectionRow } from './store.js';
import { Catalog } from './catalog.js';
import type { Config } from './config.js';
import { AppError, type Supplier } from './types.js';
import { CompatibleSupplier, customSupplierSchema, type CustomSupplierConfig } from './compatible-supplier.js';
import { QuantumVault } from './quantumvault.js';
import { PartnerJobs } from './partner-jobs.js';

export const makeSupplier = (input:CustomSupplierConfig,exchangeRate=7.2):Supplier => input.type==='partner_jobs'
  ? new PartnerJobs(input.baseUrl,input.apiKey,input.coinToCny,exchangeRate,undefined,undefined,input.authHeader,input.authPrefix)
  : input.type==='quantumvault'
  ? new QuantumVault(input.baseUrl,input.apiKey,undefined,undefined,input.authHeader,input.authPrefix)
  : new CompatibleSupplier(input);

export class CustomProviders {
  private changing = new Set<string>();
  private factory:(input:CustomSupplierConfig)=>Supplier;
  constructor(private store:Store,private config:Config,private catalog:Catalog,factory?:(input:CustomSupplierConfig)=>Supplier) {this.factory=factory??(input=>makeSupplier(input,config.USDT_CNY_RATE));}
  private rows(){return this.store.all<SupplierConnectionRow>('SELECT * FROM supplier_connections ORDER BY created_at');}
  private row(id:string){const row=this.store.get<SupplierConnectionRow>('SELECT * FROM supplier_connections WHERE id=?',id);if(!row)throw new AppError(404,'供应商不存在');return row;}
  private configFor(row:SupplierConnectionRow):CustomSupplierConfig {
    const dec = this.store.decrypt<{apiKey:string;baseUrl?:string;authHeader?:string;authPrefix?:string;paths?:Record<string,string>}>(row.key_cipher);
    const parsedPaths = dec.paths ?? JSON.parse(row.paths || "{}");
    return customSupplierSchema.parse({
      name: row.name,
      baseUrl: dec.baseUrl || row.base_url,
      type: row.provider_type,
      authHeader: dec.authHeader || row.auth_header,
      authPrefix: dec.authPrefix !== undefined ? dec.authPrefix : row.auth_prefix,
      paths: parsedPaths,
      apiKey: dec.apiKey,
      enabled: !!row.enabled,
      supportsIdempotency: !!row.supports_idempotency,
      coinToCny: row.coin_to_cny,
      markupPercent: row.markup_percent ?? null,
      autoEnable: row.auto_enable !== 0,
    });
  }
  private pending(id:string){return this.store.get<{n:number}>("SELECT COUNT(*) AS n FROM orders WHERE provider=? AND status NOT IN ('delivered','cancelled')",id)!.n;}
  load(){
    if(this.store.get("SELECT value FROM settings WHERE name='custom_live'"))this.config.PAYMENT_MODE='manual';
    for(const row of this.rows()) {
      const settings=this.configFor(row);
      if (row.base_url !== 'https://encrypted.invalid') {
        const cipher = storeEncrypted(this.store, settings);
        this.store.run("UPDATE supplier_connections SET base_url='https://encrypted.invalid', auth_header='X-API-Key', auth_prefix='', paths='{}', key_cipher=? WHERE id=?", cipher, row.id);
      }
      if(settings.apiKey)this.catalog.providers.set(row.id,this.factory(settings));
    }
  }
  list(){
    const stats = new Map(this.store.all<{provider:string;total:number;enabled:number;in_stock:number}>("SELECT provider, COUNT(*) AS total, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled, SUM(CASE WHEN in_stock=1 THEN 1 ELSE 0 END) AS in_stock FROM products GROUP BY provider").map(r=>[r.provider,{total:r.total||0,enabled:r.enabled||0,inStock:r.in_stock||0}]));
    return this.rows().map(row=>{
      const st = stats.get(row.id) ?? {total:0,enabled:0,inStock:0};
      const cfg = this.configFor(row);
      return {id:row.id,name:row.name,baseUrl:cfg.baseUrl,type:cfg.type,authHeader:cfg.authHeader,authPrefix:cfg.authPrefix,paths:cfg.paths,enabled:cfg.enabled,supportsIdempotency:cfg.supportsIdempotency,coinToCny:cfg.coinToCny,markupPercent:cfg.markupPercent??null,autoEnable:cfg.autoEnable!==false,hasKey:!!cfg.apiKey,pendingOrders:this.pending(row.id),productCount:st.total,enabledProductCount:st.enabled,inStockProductCount:st.inStock,updatedAt:row.updated_at};
    });
  }
  async save(input:CustomSupplierConfig, id?:string){
    const existing=id?this.row(id):undefined;const supplierId=id??`supplier-${randomUUID()}`;
    if(this.changing.has(supplierId))throw new AppError(409,'该供应商正在更新，请稍后再试','SUPPLIER_BUSY');
    this.changing.add(supplierId);
    try {
      const old=existing?this.configFor(existing):undefined;
      const settings={...input,apiKey:input.apiKey || old?.apiKey || '',supportsIdempotency:input.type!=='compatible'?false:input.supportsIdempotency};
      if(settings.enabled&&!settings.apiKey)throw new AppError(400,'启用供应商前请填写 API Key');
      const changedConnection=!!old && (old.baseUrl!==settings.baseUrl || old.apiKey!==settings.apiKey || old.type!==settings.type || old.authHeader!==settings.authHeader || old.authPrefix!==settings.authPrefix || old.supportsIdempotency!==settings.supportsIdempotency || old.coinToCny!==settings.coinToCny || JSON.stringify(old.paths)!==JSON.stringify(settings.paths));
      if(changedConnection&&this.pending(supplierId))throw new AppError(409,'该供应商仍有未完成订单，请先处理订单后再更改接口或密钥','SUPPLIER_HAS_ORDERS');
      const candidate=settings.apiKey?this.factory(settings):undefined;
      const mustSync=settings.enabled && (!existing || !old?.enabled || changedConnection);
      const products=mustSync ? await candidate!.products() : undefined;
      const now=new Date().toISOString();const ciphertext=storeEncrypted(this.store,settings);
      const write=()=>{
        if(existing){
          const current=this.row(supplierId);
          if(current.updated_at!==existing.updated_at)throw new AppError(409,'供应商已被更新，请刷新后重试');
          if(changedConnection&&this.pending(supplierId))throw new AppError(409,'该供应商仍有未完成订单，请先处理订单后再更改接口或密钥','SUPPLIER_HAS_ORDERS');
        }
        this.store.run(`INSERT INTO supplier_connections(id,name,base_url,auth_header,auth_prefix,paths,key_cipher,enabled,supports_idempotency,provider_type,coin_to_cny,markup_percent,auto_enable,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,auth_header=excluded.auth_header,auth_prefix=excluded.auth_prefix,paths=excluded.paths,key_cipher=excluded.key_cipher,enabled=excluded.enabled,supports_idempotency=excluded.supports_idempotency,provider_type=excluded.provider_type,coin_to_cny=excluded.coin_to_cny,markup_percent=excluded.markup_percent,auto_enable=excluded.auto_enable,updated_at=excluded.updated_at`,
          supplierId,settings.name,'https://encrypted.invalid','X-API-Key','','{}',ciphertext,+settings.enabled,+settings.supportsIdempotency,settings.type,settings.coinToCny,settings.markupPercent??null,+(settings.autoEnable!==false),existing?.created_at??now,now);
        if(settings.enabled)this.store.run("INSERT OR IGNORE INTO settings(name,value) VALUES ('custom_live',?)",this.store.encrypt({active:true}));
        this.store.audit(existing?'supplier.update':'supplier.create',supplierId);
      };
      const count=products!==undefined?this.catalog.applySnapshot(supplierId,'live',products,write):(this.store.transaction(write),0);
      if (existing && (old?.markupPercent ?? null) !== (settings.markupPercent ?? null)) {
        this.catalog.recalculatePrices(supplierId);
      }
      if(candidate)this.catalog.providers.set(supplierId,candidate);else this.catalog.providers.delete(supplierId);
      if(settings.enabled)this.config.PAYMENT_MODE='manual';
      return {id:supplierId,count};
    } catch(error){
      if(error instanceof AppError&&error.code==='SUPPLIER_401')throw new AppError(400,'供应商 API Key 无效或已停用','SUPPLIER_AUTH');
      throw error;
    } finally {this.changing.delete(supplierId);}
  }
  async toggle(id:string, enabled:boolean){
    const existing=this.row(id);
    const settings=this.configFor(existing);
    if(enabled&&!settings.apiKey)throw new AppError(400,'启用供应商前请填写 API Key');
    const hasProducts=(this.store.get<{n:number}>('SELECT COUNT(*) AS n FROM products WHERE provider=?',id)?.n??0)>0;
    if(enabled&&!hasProducts){
      return this.save({...settings,enabled:true},id);
    }
    const now=new Date().toISOString();
    this.store.transaction(()=>{
      this.store.run('UPDATE supplier_connections SET enabled=?,updated_at=? WHERE id=?',+enabled,now,id);
      if(enabled)this.store.run("INSERT OR IGNORE INTO settings(name,value) VALUES ('custom_live',?)",this.store.encrypt({active:true}));
      this.store.audit(enabled?'supplier.enable':'supplier.disable',id);
    });
    if(enabled)this.config.PAYMENT_MODE='manual';
    return {id,enabled};
  }
  async test(id:string){const provider=this.catalog.providers.get(id);if(!provider)throw new AppError(400,'请先填写 API Key');const products=await provider.products();return {count:z.array(z.unknown()).parse(products).length};}
  async balance(id:string){const provider=this.catalog.providers.get(id);if(!provider)throw new AppError(400,'请先填写 API Key');return provider.balance();}
  remove(id:string){
    const row=this.row(id);
    this.store.transaction(()=>{
      if(this.store.get<{n:number}>('SELECT COUNT(*) AS n FROM orders WHERE provider=?',id)!.n)throw new AppError(409,'该供应商已有订单，请停用以保留订单记录','SUPPLIER_HAS_ORDERS');
      this.store.run('DELETE FROM products WHERE provider=?',id);this.store.run('DELETE FROM supplier_connections WHERE id=?',id);this.store.audit('supplier.delete',id);
    });
    if(row)this.catalog.providers.delete(id);
  }
}
function storeEncrypted(store:Store,s:CustomSupplierConfig){return store.encrypt({apiKey:s.apiKey,baseUrl:s.baseUrl,authHeader:s.authHeader,authPrefix:s.authPrefix,paths:s.paths});}
