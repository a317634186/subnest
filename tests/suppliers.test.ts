import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { readConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { customSupplierSchema, CompatibleSupplier } from '../server/compatible-supplier.js';
import { QuantumVault } from '../server/quantumvault.js';
import { PartnerJobs, serviceSubjectHash } from '../server/partner-jobs.js';
import { publicAddresses, publicHttpsFetch } from '../server/public-https.js';
import { AppError, type Supplier, type SupplierOrder, type SupplierProduct } from '../server/types.js';

function config(path=':memory:'){return readConfig({HOST:'127.0.0.1',PORT:'4180',APP_URL:'http://localhost:4180',ADMIN_PASSWORD:'test-password-with-32-characters',DATA_ENCRYPTION_KEY:'e'.repeat(64),DATABASE_PATH:path,PRODSELLER_MODE:'demo',PAYMENT_MODE:'demo'});}
function input(overrides:Record<string,unknown>={}){return customSupplierSchema.parse({name:'Test supplier',type:'compatible',baseUrl:'https://supplier.example/v1',apiKey:'fake-key-123456',authHeader:'X-API-Key',authPrefix:'',enabled:true,supportsIdempotency:false,paths:{products:'/products',product:'/products/{productId}',orders:'/orders',order:'/orders/{orderId}',balance:'/balance'},...overrides});}
class NonIdempotentSupplier implements Supplier {
  readonly supportsIdempotency=false;readonly maxQuantity=1;calls=0;
  async products():Promise<SupplierProduct[]>{return [{id:'sku',name:'Test item',price:1,inStock:true,delivery:{type:'instant'}}];}
  async product(){return (await this.products())[0];}
  async balance(){return {balance:5,membership:'USD'};}
  async purchase():Promise<SupplierOrder>{this.calls++;throw new AppError(502,'Connection interrupted','SUPPLIER_UNAVAILABLE');}
  async order(id:string):Promise<SupplierOrder>{return {orderId:id,status:'delivered',product:{id:id==='wrong'?'other':'sku',name:'Test item'},quantity:1,deliveredKey:'PRIVATE-DELIVERY'};}
  async orders(){return {orders:[]};}
}
test('multiple supplier credentials remain encrypted and cannot be read back',async t=>{
  const custom=new NonIdempotentSupplier();const c=config();const f=createApp(c,undefined,undefined,()=>custom);t.after(()=>f.store.close());
  const a=await f.customProviders.save(input());const b=await f.customProviders.save(input({name:'Another',apiKey:'other-secret-987654'}));
  assert.notEqual(a.id,b.id);assert.equal(c.PAYMENT_MODE,'manual');assert.equal(c.PRODSELLER_MODE,'demo');
  const rows=f.store.all<{key_cipher:string}>('SELECT key_cipher FROM supplier_connections');assert.equal(rows.length,2);assert.ok(rows.every(row=>!row.key_cipher.includes('fake-key')&&!row.key_cipher.includes('other-secret')));
  const list=f.customProviders.list();assert.equal(list.length,2);assert.equal(JSON.stringify(list).includes('fake-key'),false);assert.equal(JSON.stringify(list).includes('other-secret'),false);assert.ok(list.every(s=>s.hasKey));
  await f.customProviders.save(input({name:'Renamed',apiKey:''}),a.id);const stored=f.store.get<{key_cipher:string}>('SELECT key_cipher FROM supplier_connections WHERE id=?',a.id)!;assert.equal(f.store.decrypt<{apiKey:string}>(stored.key_cipher).apiKey,'fake-key-123456');
  assert.equal(f.catalog.list().length,2);assert.ok(f.catalog.list().every(p=>!p.demo));
});
test('non-idempotent timeout never repurchases and can recover a verified order',async t=>{
  const custom=new NonIdempotentSupplier();const c=config();const f=createApp(c,undefined,undefined,()=>custom);t.after(()=>f.store.close());const supplier=await f.customProviders.save(input());
  f.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const product=f.catalog.list()[0];const checkout={checkoutId:randomUUID(),accessToken:'d'.repeat(64),productId:product.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay' as const,expectedUnitPrice:product.priceCents};
  assert.throws(()=>f.orders.create({...checkout,checkoutId:randomUUID(),quantity:2}),/一件/);
  const o=f.orders.create(checkout);await f.orders.confirmPayment(o.id);assert.equal(f.orders.get(o.id).status,'needs_attention');await f.orders.fulfill(o.id);await f.orders.fulfill(o.id);assert.equal(custom.calls,1);assert.equal(f.orders.view(f.orders.get(o.id),true).canReconcile,true);
  await assert.rejects(()=>f.orders.reconcile(o.id,'wrong'),(e:AppError)=>e.code==='ORDER_MISMATCH');
  await assert.rejects(()=>f.customProviders.save(input({baseUrl:'https://other.example/v1',apiKey:''}),supplier.id),(e:AppError)=>e.code==='SUPPLIER_HAS_ORDERS');
  await f.customProviders.save(input({enabled:false,apiKey:''}),supplier.id);assert.equal(f.catalog.list().length,0);
  await f.orders.reconcile(o.id,'valid');assert.equal(f.orders.get(o.id).status,'delivered');assert.deepEqual(f.orders.view(f.orders.get(o.id)).keys,['PRIVATE-DELIVERY']);assert.equal(custom.calls,1);
  assert.throws(()=>f.customProviders.remove(supplier.id),(e:AppError)=>e.code==='SUPPLIER_HAS_ORDERS');
});
test('encrypted supplier settings and manual mode survive restart',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'subnest-suppliers-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'store.sqlite');const fake=new NonIdempotentSupplier();const first=createApp(config(path),undefined,undefined,()=>fake);
  const saved=await first.customProviders.save(input());first.store.close();let restored='';const secondConfig=config(path);const second=createApp(secondConfig,undefined,undefined,settings=>{restored=settings.apiKey;return fake;});t.after(()=>second.store.close());
  assert.equal(restored,'fake-key-123456');assert.equal(secondConfig.PAYMENT_MODE,'manual');assert.ok(second.catalog.providers.has(saved.id));assert.equal(second.catalog.list().length,1);
});
test('disabled presets can be saved without an API key',async t=>{const f=createApp(config(),undefined,undefined,()=>new NonIdempotentSupplier());t.after(()=>f.store.close());const saved=await f.customProviders.save(input({apiKey:'',enabled:false}));assert.equal(f.customProviders.list()[0].hasKey,false);assert.equal(f.catalog.providers.has(saved.id),false);assert.equal(f.catalog.list().length,0);});
test('supplier URL validation blocks private and rebinding addresses',async()=>{
  for(const baseUrl of ['http://example.com','https://127.0.0.1','https://localhost','https://[::1]','https://user:pass@example.com','https://example.com/?secret=1','https://example.com:8443'])assert.equal(customSupplierSchema.safeParse(inputObject(baseUrl)).success,false);
  await assert.rejects(()=>publicAddresses('supplier.example',async()=>[{address:'127.0.0.1',family:4}]),(e:AppError)=>e.code==='UNSAFE_SUPPLIER_URL');
  await assert.rejects(()=>publicAddresses('supplier.example',async()=>[{address:'8.8.8.8',family:4},{address:'169.254.169.254',family:4}]),(e:AppError)=>e.code==='UNSAFE_SUPPLIER_URL');
  assert.equal((await publicAddresses('supplier.example',async()=>[{address:'8.8.8.8',family:4}])).length,1);
  await assert.rejects(()=>publicHttpsFetch('https://127.0.0.1/api'),(e:AppError)=>e.code==='UNSAFE_SUPPLIER_URL');
});
function inputObject(baseUrl:string){return {name:'test',baseUrl,type:'compatible',apiKey:'12345678',enabled:false,paths:{products:'/products',product:'/products/{productId}',orders:'/orders',order:'/orders/{orderId}',balance:'/balance'}};}
test('compatible preset uses specified paths and omits idempotency header when not guaranteed',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];const fetcher:typeof fetch=async(url,init)=>{calls.push({url:String(url),init:init!});return new Response(JSON.stringify({orderId:'abc',status:'delivered'}),{status:200});};const adapter=new CompatibleSupplier(input(),fetcher,0);
  await adapter.purchase({productId:'sku',quantity:1},'stable-key');assert.equal(calls[0].url,'https://supplier.example/v1/orders');assert.equal((calls[0].init.headers as Record<string,string>)['Idempotency-Key'],undefined);assert.equal(adapter.maxQuantity,1);
});
test('QuantumVault maps variants, variable delivery fields and single-unit purchases',async()=>{
  const variantProduct={productKey:'video',name:'Video',currency:'USD',price:null,inStock:true,acquisitionMode:'paid',variants:[{key:'month',name:'Month',price:3,stock:4,inStock:true},{key:'year',name:'Year',price:12,stock:1,inStock:true}]};
  const simple={productKey:'mail',name:'Mail',currency:'USD',price:0.25,stock:10,inStock:true,variants:[],acquisitionMode:'paid'};const calls:{url:string;init:RequestInit}[]=[];
  const fetcher:typeof fetch=async(url,init)=>{calls.push({url:String(url),init:init!});const path=new URL(String(url)).pathname;let response:unknown;
    if(path.endsWith('/products'))response={products:[simple,variantProduct]};else if(path.endsWith('/products/video'))response={product:variantProduct};else if(path.endsWith('/purchase'))response={success:true,order:{fulfilled:1,items:[{orderId:'QV-1',productKey:'video',variantKey:'month',fields:[{name:'url',label:'Activation link',value:'https://example.com/key'},{name:'pin',label:'PIN',value:'1234'}]}]}};else response={order:{orderId:'QV-1',productKey:'video',variantKey:'month',data:{url:'https://example.com/key'}}};return new Response(JSON.stringify(response),{status:200});};
  const adapter=new QuantumVault('https://supplier.example/api/v1','fake-key',fetcher,0);const list=await adapter.products();assert.equal(list.length,3);const month=list.find(p=>p.name==='Video · Month')!;assert.equal(month.price,3);assert.equal((await adapter.product(month.id)).price,3);assert.equal(adapter.maxQuantity,1);assert.equal(adapter.supportsIdempotency,false);
  const result=await adapter.purchase({productId:month.id,quantity:1},'ignored');assert.equal(result.product?.id,month.id);assert.deepEqual(result.deliveredKeys,['Activation link: https://example.com/key\nPIN: 1234']);const call=calls.find(c=>c.url.endsWith('/purchase'))!;assert.deepEqual(JSON.parse(call.init.body as string),{productKey:'video',variantKey:'month',quantity:1});assert.equal((call.init.headers as Record<string,string>)['Idempotency-Key'],undefined);await assert.rejects(()=>adapter.purchase({productId:month.id,quantity:2},'ignored'));
  const recovered=await adapter.order('QV-1');assert.equal(recovered.product?.id,month.id);assert.deepEqual(recovered.deliveredKeys,['url: https://example.com/key']);
});
test('supplier management routes require admin and never return the saved key',async t=>{
  const fake=new NonIdempotentSupplier();const app=createApp(config(),undefined,undefined,()=>fake);const server=app.app.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;const base=`http://127.0.0.1:${port}/api`;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));app.store.close();});
  const unauthorized=await fetch(base+'/admin/suppliers');assert.equal(unauthorized.status,401);
  const login=await fetch(base+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-password-with-32-characters'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];const credentials={Cookie:cookie,'Content-Type':'application/json'};
  const created=await fetch(base+'/admin/suppliers',{method:'POST',headers:credentials,body:JSON.stringify(input())});assert.equal(created.status,201);const response=await created.json() as {id:string};
  const listed=await fetch(base+'/admin/suppliers',{headers:{Cookie:cookie}});const data=await listed.text();assert.equal(data.includes('fake-key-123456'),false);const rows=JSON.parse(data).suppliers;assert.equal(rows.length,1);assert.equal(rows[0].hasKey,true);assert.equal(rows[0].id,response.id);
  const probe=await fetch(`${base}/admin/suppliers/${response.id}/test`,{method:'POST',headers:credentials,body:'{}'});assert.equal(probe.status,200);assert.equal(fake.calls,0);
  const forbidden=await fetch(base+'/admin/suppliers',{method:'POST',headers:{...credentials,Origin:'https://attacker.example'},body:JSON.stringify(input())});assert.equal(forbidden.status,403);
});
test('documented no-charge supplier errors allow a safe later retry',async t=>{
  class KnownFailure extends NonIdempotentSupplier {readonly noChargeOnHttpError=[503];override async purchase():Promise<SupplierOrder>{this.calls++;throw new AppError(502,'Not charged','SUPPLIER_503');}}
  const supplier=new KnownFailure();const f=createApp(config(),undefined,undefined,()=>supplier);t.after(()=>f.store.close());await f.customProviders.save(input());f.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const p=f.catalog.list()[0];const o=f.orders.create({checkoutId:randomUUID(),accessToken:'e'.repeat(64),productId:p.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay',expectedUnitPrice:p.priceCents});await f.orders.confirmPayment(o.id);assert.equal(f.orders.get(o.id).purchase_started,0);await f.orders.fulfill(o.id);assert.equal(supplier.calls,2);assert.equal(f.orders.get(o.id).status,'needs_attention');
});
test('Pixel and SheerID presets map task costs, submission and status without exposing inputs',async()=>{
  const verification='https://services.sheerid.com/verify/example/?verificationId=verification123';
  const costs={gemini:{pro:35,plus:25},youtube:30,spotify:30,soundcloud:30,perplexity:30};const payloads:{path:string;body:unknown}[]=[];
  const fetcher:typeof fetch=async(url,init)=>{const path=new URL(String(url)).pathname;let data:unknown;
    if(path.endsWith('/sheerid/info'))data={ok:true,costs};else if(path.endsWith('/info'))data={ok:true,coins:200};
    else if(path.endsWith('/docs'))return new Response('<meta name="partner-api-prices" content="{&quot;pixel&quot;:{&quot;autopay&quot;:35,&quot;payadd&quot;:10,&quot;extract&quot;:25}}">',{status:200});
    else if(path.endsWith('/pixel/submit')){payloads.push({path,body:JSON.parse(init?.body as string)});data={ok:true,submitted:1,results:[{ok:true,job_id:1042}]};}
    else if(path.endsWith('/sheerid/submit')){payloads.push({path,body:JSON.parse(init?.body as string)});data={ok:true,submitted:1,results:[{ok:true,job_id:551}]};}
    else if(path.endsWith('/pixel/status/1042'))data={ok:true,status:'success',mode:'extract',email:'owner@gmail.com'};
    else data={ok:true,status:'running',service:'gemini',mode:'pro',link:verification};
    return new Response(JSON.stringify(data),{status:200});};
  const supplier=new PartnerJobs('https://partner.example/api/v2','fake-api-key',1,7.2,fetcher,0);const products=await supplier.products();assert.equal(products.length,9);assert.ok(products.every(p=>p.initiallyEnabled===false));assert.equal(products.find(p=>p.id==='pixel:payadd')!.price,10/7.2);assert.equal(products.find(p=>p.id==='sheerid:gemini:pro')!.price,35/7.2);
  const pixel={kind:'pixel' as const,gmail:'owner@gmail.com',password:'FAKE-PASSWORD',totp:'A'.repeat(32),backupCodes:[]};const submitted=await supplier.purchase({productId:'pixel:extract',quantity:1,serviceInput:pixel},'ignored');assert.equal(submitted.orderId,'pixel:1042');assert.equal(submitted.status,'paid');assert.equal((payloads[0].body as {mode:string}).mode,'extract');const complete=await supplier.order('pixel:1042');assert.equal(complete.status,'delivered');assert.equal(complete.subjectHash,serviceSubjectHash(pixel));
  const sheer={kind:'sheerid' as const,link:verification};const s=await supplier.purchase({productId:'sheerid:gemini:pro',quantity:1,serviceInput:sheer},'ignored');assert.equal(s.orderId,'sheerid:551');const pending=await supplier.order('sheerid:551');assert.equal(pending.status,'paid');assert.equal(pending.subjectHash,serviceSubjectHash(sheer));assert.equal((payloads[1].body as {service:string}).service,'gemini');
});
test('task credentials are requested after payment, encrypted, and removed after submission',async t=>{
  const fake:Supplier={supportsIdempotency:false,maxQuantity:1,products:async()=>[{id:'pixel:extract',name:'Pixel task',price:1,inStock:true,delivery:{type:'custom'},inputKind:'pixel',initiallyEnabled:false}],product:async()=>({id:'pixel:extract',name:'Pixel task',price:1,inStock:true,inputKind:'pixel'}),balance:async()=>({balance:100,membership:'coins'}),purchase:async value=>{assert.equal(value.serviceInput?.kind,'pixel');return {orderId:'pixel:1042',status:'paid'};},order:async()=>({orderId:'pixel:1042',status:'paid'}),orders:async()=>({})};
  const f=createApp(config(),undefined,undefined,()=>fake);t.after(()=>f.store.close());const supplier=await f.customProviders.save(input({type:'partner_jobs'}));const adminProduct=f.catalog.list(true).find(p=>p.provider===supplier.id)!;assert.equal(adminProduct.enabled,false);assert.equal(adminProduct.category,'services');assert.equal(f.catalog.list().some(p=>p.id===adminProduct.id),false);
  f.store.run('UPDATE products SET enabled=1 WHERE id=?',adminProduct.id);f.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const p=f.catalog.publicProduct(f.catalog.product(adminProduct.id));const o=f.orders.create({checkoutId:randomUUID(),accessToken:'f'.repeat(64),productId:p.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay',expectedUnitPrice:p.priceCents});
  await f.orders.confirmPayment(o.id);assert.equal(f.orders.get(o.id).status,'awaiting_input');const details={kind:'pixel' as const,gmail:'owner@gmail.com',password:'FAKE-SECRET-PASSWORD',totp:'B'.repeat(32),backupCodes:[]};const updated=await f.orders.submitServiceInput(f.orders.get(o.id),{serviceInput:details,serviceConsent:true});assert.equal(updated.status,'activating');const record=f.orders.get(o.id);const priv=f.store.decrypt<Record<string,unknown>>(record.private_data);assert.equal(priv.serviceInput,undefined);assert.ok(priv.serviceSubjectHash);assert.equal(record.private_data.includes(details.password),false);assert.equal(JSON.stringify(updated).includes(details.password),false);assert.equal(JSON.stringify(f.orders.view(record,true)).includes(details.totp),false);
});
test('task timeout removes credentials and does not resend them on retry',async t=>{
  let calls=0;const fake:Supplier={supportsIdempotency:false,maxQuantity:1,products:async()=>[{id:'pixel:extract',name:'Pixel',price:1,inStock:true,inputKind:'pixel'}],product:async()=>({id:'pixel:extract',name:'Pixel',price:1,inStock:true}),balance:async()=>({balance:1,membership:'coins'}),purchase:async()=>{calls++;throw new AppError(502,'timeout','SUPPLIER_UNAVAILABLE');},order:async()=>({orderId:'pixel:1',status:'paid'}),orders:async()=>({})};
  const f=createApp(config(),undefined,undefined,()=>fake);t.after(()=>f.store.close());await f.customProviders.save(input({type:'partner_jobs'}));f.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const p=f.catalog.list()[0];const o=f.orders.create({checkoutId:randomUUID(),accessToken:'f'.repeat(64),productId:p.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay',expectedUnitPrice:p.priceCents});await f.orders.confirmPayment(o.id);
  await f.orders.submitServiceInput(f.orders.get(o.id),{serviceInput:{kind:'pixel',gmail:'owner@gmail.com',password:'FAKE-PASSWORD',totp:'C'.repeat(32),backupCodes:[]},serviceConsent:true});const row=f.orders.get(o.id);assert.equal(row.status,'needs_attention');assert.equal(f.store.decrypt<Record<string,unknown>>(row.private_data).serviceInput,undefined);await f.orders.fulfill(o.id);assert.equal(calls,1);
});
test('task input validation requires consent and a genuine SheerID hostname',async()=>{
  const {submitServiceInputSchema}=await import('../server/orders.js');const link='https://services.sheerid.com/verify/demo/?verificationId=abc123';assert.equal(submitServiceInputSchema.safeParse({serviceInput:{kind:'sheerid',link},serviceConsent:true}).success,true);assert.equal(submitServiceInputSchema.safeParse({serviceInput:{kind:'sheerid',link},serviceConsent:false}).success,false);assert.equal(submitServiceInputSchema.safeParse({serviceInput:{kind:'sheerid',link:'https://services.sheerid.com.attacker.example/verify/a?verificationId=x'},serviceConsent:true}).success,false);assert.equal(submitServiceInputSchema.safeParse({serviceInput:{kind:'pixel',gmail:'not-gmail@example.com',password:'x',totp:'A'.repeat(32),backupCodes:[]},serviceConsent:true}).success,false);
});
test('customer secrets remain encrypted while the task is in flight',async t=>{
  let release!:(result:SupplierOrder)=>void;let started!:()=>void;const running=new Promise<void>(r=>started=r);const fake:Supplier={supportsIdempotency:false,maxQuantity:1,products:async()=>[{id:'pixel:extract',name:'Pixel',price:1,inStock:true,inputKind:'pixel'}],product:async()=>({id:'pixel:extract',name:'Pixel',price:1,inStock:true}),balance:async()=>({balance:1,membership:'coins'}),purchase:async()=>{started();return await new Promise<SupplierOrder>(r=>release=r);},order:async()=>({orderId:'pixel:1',status:'paid'}),orders:async()=>({})};
  const f=createApp(config(),undefined,undefined,()=>fake);t.after(()=>f.store.close());await f.customProviders.save(input({type:'partner_jobs'}));f.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const p=f.catalog.list()[0];const o=f.orders.create({checkoutId:randomUUID(),accessToken:'f'.repeat(64),productId:p.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay',expectedUnitPrice:p.priceCents});await f.orders.confirmPayment(o.id);const task=f.orders.submitServiceInput(f.orders.get(o.id),{serviceInput:{kind:'pixel',gmail:'owner@gmail.com',password:'FAKE-PRIVATE',totp:'D'.repeat(32),backupCodes:[]},serviceConsent:true});await running;const row=f.orders.get(o.id);assert.equal(row.private_data.includes('FAKE-PRIVATE'),false);assert.equal(JSON.stringify(f.orders.view(row,true)).includes('FAKE-PRIVATE'),false);assert.ok(f.store.decrypt<Record<string,unknown>>(row.private_data).serviceInput);release({orderId:'pixel:1042',status:'paid'});await task;assert.equal(f.store.decrypt<Record<string,unknown>>(f.orders.get(o.id).private_data).serviceInput,undefined);
});
test('task input endpoint requires the customer key and affirmative consent',async t=>{
  const fake:Supplier={supportsIdempotency:false,maxQuantity:1,products:async()=>[{id:'pixel:extract',name:'Pixel',price:1,inStock:true,inputKind:'pixel'}],product:async()=>({id:'pixel:extract',name:'Pixel',price:1,inStock:true}),balance:async()=>({balance:1,membership:'coins'}),purchase:async()=>({orderId:'pixel:1042',status:'paid'}),order:async()=>({orderId:'pixel:1042',status:'paid'}),orders:async()=>({})};
  const app=createApp(config(),undefined,undefined,()=>fake);await app.customProviders.save(input({type:'partner_jobs'}));app.store.run("UPDATE channels SET enabled=1,instructions='Test' WHERE id='alipay'");const p=app.catalog.list()[0];const token='f'.repeat(64);const order=app.orders.create({checkoutId:randomUUID(),accessToken:token,productId:p.id,quantity:1,email:'buyer@example.com',activationEmails:[],paymentChannel:'alipay',expectedUnitPrice:p.priceCents});await app.orders.confirmPayment(order.id);
  const server=app.app.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/orders/${order.id}/service-input`;t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));app.store.close();});const body={serviceInput:{kind:'pixel',gmail:'owner@gmail.com',password:'FAKE-PASSWORD',totp:'D'.repeat(32),backupCodes:[]},serviceConsent:true};
  const request=(bearer:string,bodyValue:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:JSON.stringify(bodyValue)});assert.equal((await request('wrong',body)).status,404);assert.equal((await request(token,{...body,serviceConsent:false})).status,400);const result=await request(token,body);assert.equal(result.status,200);const text=await result.text();assert.equal(text.includes('FAKE-PASSWORD'),false);assert.equal(text.includes('D'.repeat(32)),false);assert.equal(app.store.decrypt<Record<string,unknown>>(app.orders.get(order.id).private_data).serviceInput,undefined);
});

test("prodseller supplier name, baseUrl, headers and paths can be edited while preserving encrypted key", async t => {
  const dir = mkdtempSync(join(tmpdir(), "subnest-ps-edit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, "store.sqlite");
  let lastOptions: unknown;
  const factory = (key: string, options?: unknown) => {
    lastOptions = { key, options };
    return new NonIdempotentSupplier();
  };
  const first = createApp(config(dbPath), undefined, factory);
  const server = first.app.listen(0);
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-with-32-characters" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];

  const connectRes = await fetch(`http://127.0.0.1:${port}/api/admin/providers/prodseller`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ apiKey: "psk_initial_secret_123", name: "Primary Hub", baseUrl: "https://hub.example/v2", authHeader: "X-Hub-Key" }),
  });
  assert.equal(connectRes.status, 200);
  assert.equal((lastOptions as { key: string; options: { baseUrl: string; authHeader: string } }).key, "psk_initial_secret_123");
  assert.equal((lastOptions as { options: { baseUrl: string } }).options.baseUrl, "https://hub.example/v2");

  // Rename without re-sending apiKey
  const renameRes = await fetch(`http://127.0.0.1:${port}/api/admin/providers/prodseller`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ apiKey: "", name: "Renamed Hub", baseUrl: "https://hub.example/v2", authHeader: "X-Hub-Key" }),
  });
  assert.equal(renameRes.status, 200);
  const dashRes = await fetch(`http://127.0.0.1:${port}/api/admin/dashboard`, { headers: { Cookie: cookie } });
  const dash = await dashRes.json() as { prodseller: { name: string; baseUrl: string; authHeader: string; hasKey: boolean } };
  assert.equal(dash.prodseller.name, "Renamed Hub");
  assert.equal(dash.prodseller.baseUrl, "https://hub.example/v2");
  assert.equal(dash.prodseller.authHeader, "X-Hub-Key");
  assert.equal(dash.prodseller.hasKey, true);
  assert.equal(JSON.stringify(dash).includes("psk_initial_secret_123"), false);
  assert.equal(first.catalog.list(true).find(p => p.provider === "prodseller")?.providerName, "Renamed Hub");

  server.close();
  first.store.close();
});

test("Alipay sandbox gateway builds RSA2 signed page pay URL and verifies callbacks", async t => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const stripPem = (pem: string) => pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const c = readConfig({
    HOST: "127.0.0.1",
    PORT: "4180",
    APP_URL: "http://localhost:4180",
    ADMIN_PASSWORD: "test-password-with-32-characters",
    DATA_ENCRYPTION_KEY: "e".repeat(64),
    DATABASE_PATH: ":memory:",
    PRODSELLER_MODE: "demo",
    PAYMENT_MODE: "demo",
    AIPAY_GATEWAY_URL: "https://openapi.alipay.com/gateway.do",
    AIPAY_APP_ID: "2021000000000000",
    AIPAY_PRIVATE_KEY: stripPem(privateKey),
    AIPAY_PUBLIC_KEY: stripPem(publicKey),
    AIPAY_ALIPAY_PUBLIC_KEY: stripPem(publicKey),
  });
  const f = createApp(c);
  t.after(() => f.store.close());
  assert.equal(f.alipay.enabled, true);
  assert.equal(f.alipay.gatewayUrl, "https://openapi.alipay.com/gateway.do");

  const payUrl = new URL(f.alipay.buildPagePayUrl({ id: "order-123", productName: "Test Plan", quantity: 1, totalCents: 1990 }));
  assert.equal(`${payUrl.origin}${payUrl.pathname}`, "https://openapi.alipay.com/gateway.do");
  assert.equal(payUrl.searchParams.get("app_id"), "2021000000000000");
  assert.equal(payUrl.searchParams.get("format"), "json");
  assert.equal(payUrl.searchParams.get("charset"), "UTF-8");
  assert.equal(payUrl.searchParams.get("sign_type"), "RSA2");
  const queryParams: Record<string, string> = {};
  for (const [k, v] of payUrl.searchParams.entries()) queryParams[k] = v;
  assert.equal(f.alipay.verifyCallback(queryParams), true);
  assert.equal(f.alipay.verifyCallback({ ...queryParams, total_amount: "0.01" }), false);
});

import { detectProductStyle } from "../server/catalog.js";
import { buildSearchIndex, searchAndSortProducts } from "../src/search.js";

test("catalog style detection and search prioritize primary brand over subtitle and description mentions", () => {
  assert.deepEqual(detectProductStyle("Gmail 2020–2024 – With 2FA, No YouTube Channel"), ["services", "gmail"]);
  assert.deepEqual(detectProductStyle("OTP Verification Number – Netflix, One Code"), ["services", "otp"]);
  assert.deepEqual(detectProductStyle("CapCut Pro Individual – 1 Month, 1,200 AI Credits"), ["design", "capcut"]);

  const sample = [
    { id: "1", name: "Autodesk 全家桶 1年", nameEn: "Autodesk All Apps 1 Year", description: "使用本人 Gmail 激活", descriptionEn: "Activate on your Gmail", category: "design", brand: "autodesk", priceCents: 5000, inStock: true, requiresEmail: true, delivery: "activation" },
    { id: "2", name: "Google AI Pro – 1个月，发到本人 Gmail", nameEn: "Google AI Pro – 1 Month, Link on Your Gmail", description: "Gemini Pro", descriptionEn: "Gemini Pro", category: "ai", brand: "gemini", priceCents: 2000, inStock: true, requiresEmail: false, delivery: "instant" },
    { id: "3", name: "Gmail 全新账号 – 带2FA验证", nameEn: "Gmail Fresh Account – With 2FA", description: "稳定耐用", descriptionEn: "Ready account", category: "services", brand: "gmail", priceCents: 300, inStock: true, requiresEmail: false, delivery: "instant" },
    { id: "4", name: "CapCut Pro – 1个月，成品账号", nameEn: "CapCut Pro – 1 Month, Ready Account", description: "视频剪辑会员", descriptionEn: "Video editor", category: "design", brand: "capcut", priceCents: 1500, inStock: true, requiresEmail: false, delivery: "instant" },
  ] as any[];

  const idx = buildSearchIndex(sample);
  const gmailResults = searchAndSortProducts(idx, { query: "gmail" });
  assert.deepEqual(gmailResults.map(p => p.id), ["3"]);

  const aliasResults = searchAndSortProducts(idx, { query: "剪映 1个月", category: "streaming" });
  assert.deepEqual(aliasResults.map(p => p.id), ["4"]);

  const mixedStock = [
    { ...sample[0], id: "out-cheap", priceCents: 100, inStock: false },
    { ...sample[1], id: "in-mid", priceCents: 2000, inStock: true },
    { ...sample[2], id: "in-cheap", priceCents: 500, inStock: true },
  ] as any[];
  const mixedIdx = buildSearchIndex(mixedStock);
  assert.deepEqual(searchAndSortProducts(mixedIdx, { query: "", stockFilter: "in" }).map(p => p.id), ["in-mid", "in-cheap"]);
  assert.deepEqual(searchAndSortProducts(mixedIdx, { query: "", stockFilter: "out" }).map(p => p.id), ["out-cheap"]);
  assert.deepEqual(searchAndSortProducts(mixedIdx, { query: "", sort: "low" }).map(p => p.id), ["in-cheap", "in-mid", "out-cheap"]);
});

test("admin can toggle suppliers, batch publish/hide products, and save custom store settings", async t => {
  const c = readConfig({
    HOST: "127.0.0.1",
    PORT: "4180",
    APP_URL: "http://localhost:4180",
    ADMIN_PASSWORD: "test-password-with-32-characters",
    DATA_ENCRYPTION_KEY: "f".repeat(64),
    DATABASE_PATH: ":memory:",
    PRODSELLER_MODE: "demo",
    PAYMENT_MODE: "demo",
  });
  const f = createApp(c);
  await f.catalog.sync("prodseller");
  const server = f.app.listen(0);
  t.after(() => { server.close(); f.store.close(); });
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  const loginRes = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4180" },
    body: JSON.stringify({ password: "test-password-with-32-characters" }),
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:4180", Cookie: cookie };

  // 1. Toggle primary supplier off -> storefront products become empty
  const offRes = await fetch(`${base}/api/admin/providers/prodseller/toggle`, {
    method: "PATCH", headers, body: JSON.stringify({ enabled: false }),
  });
  assert.equal(offRes.status, 200);
  const publicOff = await (await fetch(`${base}/api/products`)).json() as { products: any[] };
  assert.equal(publicOff.products.length, 0);

  // Toggle primary supplier back on -> storefront products restored
  await fetch(`${base}/api/admin/providers/prodseller/toggle`, {
    method: "PATCH", headers, body: JSON.stringify({ enabled: true }),
  });
  const publicOn = await (await fetch(`${base}/api/products`)).json() as { products: any[] };
  assert.equal(publicOn.products.length > 0, true);

  // 2. Batch hide and batch publish products
  const firstTwoIds = publicOn.products.slice(0, 2).map(p => p.id);
  const batchHide = await (await fetch(`${base}/api/admin/products/batch`, {
    method: "POST", headers, body: JSON.stringify({ action: "disable", ids: firstTwoIds }),
  })).json() as { count: number };
  assert.equal(batchHide.count, 2);
  const afterHide = await (await fetch(`${base}/api/products`)).json() as { products: any[] };
  assert.equal(afterHide.products.length, publicOn.products.length - 2);

  // Single product toggle back on
  await fetch(`${base}/api/admin/products/${firstTwoIds[0]}/toggle`, {
    method: "PATCH", headers, body: JSON.stringify({ enabled: true }),
  });
  const afterSingleOn = await (await fetch(`${base}/api/products`)).json() as { products: any[] };
  assert.equal(afterSingleOn.products.length, publicOn.products.length - 1);

  // 3. Save custom store settings and verify /api/config reflects them
  const saveSettings = await fetch(`${base}/api/admin/settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      storeName: "SubNest Pro",
      exchangeRate: 7.5,
      markupPercent: 50,
      supportEmail: "help@example.com",
      supportWechat: "wx123",
      supportTelegram: "t.me/test",
      announcementZh: "今日特惠",
      announcementEn: "Special offer today",
      recalculatePrices: true,
    }),
  });
  assert.equal(saveSettings.status, 200);
  const pubCfg = await (await fetch(`${base}/api/config`)).json() as any;
  assert.equal(pubCfg.storeName, "SubNest Pro");
  assert.equal(pubCfg.exchangeRate, 7.5);
  assert.equal(pubCfg.announcementZh, "今日特惠");
});

import { redactSecrets } from "../server/store.js";

test("supplier URLs and API keys are encrypted at rest in SQLite and redactSecrets scrubs all secret patterns", async t => {
  const sample = "Error with psk_1234567890abcdef and qv_live_abcdef1234567890 and pxl_secret_token_999 and Bearer my.jwt.token and MIIFakePrivateKeyForRedactionTestOnly00000000000000000000000000000000 and " + "a".repeat(64);
  const scrubbed = redactSecrets(sample, ["custom-admin-pass-123"]);
  assert.equal(scrubbed.includes("psk_1234567890abcdef"), false);
  assert.equal(scrubbed.includes("qv_live_abcdef1234567890"), false);
  assert.equal(scrubbed.includes("pxl_secret_token_999"), false);
  assert.equal(scrubbed.includes("my.jwt.token"), false);
  assert.equal(scrubbed.includes("MIIFakePrivateKeyForRedactionTestOnly00000000000000000000000000000000"), false);
  assert.equal(scrubbed.includes("a".repeat(64)), false);

  const custom = new NonIdempotentSupplier();
  const c = config();
  const f = createApp(c, undefined, undefined, () => custom);
  t.after(() => f.store.close());
  const saved = await f.customProviders.save(input({ baseUrl: "https://private-upstream.example/api/v9", apiKey: "qv_live_supersecret999" }));
  const rawRow = f.store.get<{ base_url: string; paths: string; key_cipher: string }>("SELECT base_url, paths, key_cipher FROM supplier_connections WHERE id=?", saved.id)!;
  assert.equal(rawRow.base_url, "https://encrypted.invalid");
  assert.equal(rawRow.paths, "{}");
  assert.equal(rawRow.key_cipher.includes("private-upstream.example"), false);
  assert.equal(rawRow.key_cipher.includes("qv_live_supersecret999"), false);
  const list = f.customProviders.list();
  assert.equal(list[0].baseUrl, "https://private-upstream.example/api/v9");
  assert.equal(JSON.stringify(list).includes("qv_live_supersecret999"), false);
});
