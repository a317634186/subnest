import { createHash } from 'node:crypto';
import { z } from 'zod';
import { publicHttpsFetch } from './public-https.js';
import { AppError, type ServiceInput, type Supplier, type SupplierOrder, type SupplierProduct } from './types.js';

const sha = (value:string) => createHash('sha256').update(value).digest('hex');
export function sheerId(value:string):string {
  try {
    const url=new URL(value);const id=url.searchParams.get('verificationId');
    if(url.protocol!=='https:' || url.hostname!=='services.sheerid.com' || !url.pathname.startsWith('/verify/') || url.username || url.password || !id || id.length>200) throw new Error('invalid');
    return id;
  } catch { throw new AppError(400,'请填写有效的 SheerID 验证链接','VALIDATION_ERROR'); }
}
export function serviceSubjectHash(input:ServiceInput){return input.kind==='pixel'?sha(`pixel:${input.gmail.toLowerCase()}`):sha(`sheerid:${sheerId(input.link)}`);}
const cents=z.number().finite().nonnegative().max(1000000);
const pixelPrices=z.object({autopay:cents,payadd:cents,extract:cents});
const sheerPrices=z.object({gemini:z.object({pro:cents,plus:cents}),youtube:cents,spotify:cents,soundcloud:cents,perplexity:cents});
const jobs=[
  {id:'pixel:autopay',name:'Pixel · AutoPay',kind:'pixel' as const,price:'autopay'},
  {id:'pixel:payadd',name:'Pixel · PayAdd',kind:'pixel' as const,price:'payadd'},
  {id:'pixel:extract',name:'Pixel · Extract',kind:'pixel' as const,price:'extract'},
  {id:'sheerid:gemini:pro',name:'SheerID · Gemini Pro',kind:'sheerid' as const,price:'gemini_pro'},
  {id:'sheerid:gemini:plus',name:'SheerID · Gemini Plus',kind:'sheerid' as const,price:'gemini_plus'},
  {id:'sheerid:youtube:',name:'SheerID · YouTube',kind:'sheerid' as const,price:'youtube'},
  {id:'sheerid:spotify:',name:'SheerID · Spotify',kind:'sheerid' as const,price:'spotify'},
  {id:'sheerid:soundcloud:',name:'SheerID · SoundCloud',kind:'sheerid' as const,price:'soundcloud'},
  {id:'sheerid:perplexity:',name:'SheerID · Perplexity',kind:'sheerid' as const,price:'perplexity'},
];
export class PartnerJobs implements Supplier {
  readonly supportsIdempotency=false;readonly maxQuantity=1;
  readonly noChargeOnHttpError=[401,402,403,404,429] as const;
  private nextRequestAt=0;
  constructor(private baseUrl:string,private apiKey:string,private coinToCny:number,private usdToCny:number,private transport:typeof fetch=publicHttpsFetch,private intervalMs=1100,private authHeader="X-API-Key",private authPrefix="") {}
  private async request<T>(path:string,init:RequestInit={},text=false):Promise<T>{
    const wait=Math.max(0,this.nextRequestAt-Date.now());if(wait>30000)throw new AppError(503,'供应商请求繁忙','SUPPLIER_BUSY');this.nextRequestAt=Date.now()+wait+this.intervalMs;if(wait)await new Promise(r=>setTimeout(r,wait));
    try{
      const response=await this.transport(`${this.baseUrl.replace(/\/$/,'')}${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(20000),headers:{[this.authHeader||"X-API-Key"]:`${this.authPrefix??""}${this.apiKey}`,'Content-Type':'application/json',...init.headers}});
      if(!response.ok)throw new AppError(502,({400:'供应商拒绝任务参数',401:'供应商 API Key 无效或已停用',402:'供应商 coins 余额不足',403:'供应商账号不可用',404:'供应商任务不存在',409:'任务冲突，请核对已有任务',429:'供应商请求繁忙'} as Record<number,string>)[response.status]??'供应商暂时不可用',`SUPPLIER_${response.status}`);
      return (text ? await response.text() : await response.json()) as T;
    }catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'供应商连接中断，请核对任务后处理','SUPPLIER_UNAVAILABLE');}
  }
  async products():Promise<SupplierProduct[]>{
    const pixel=await this.request<{ok:boolean}>('/info');const sheer=await this.request<{ok:boolean;costs:unknown}>('/sheerid/info');const html=await this.request<string>('/docs',{},true);
    if(!pixel.ok||!sheer.ok)throw new AppError(502,'供应商未确认账号状态','SUPPLIER_RESPONSE');
    const match=html.match(/<meta\s+name=["']partner-api-prices["']\s+content=["']([^"']+)["']/i);
    let metadata:unknown;try{metadata=JSON.parse((match?.[1]??'').replaceAll('&quot;','"').replaceAll('&amp;','&'));}catch{throw new AppError(502,'无法读取供应商最新任务成本','SUPPLIER_RESPONSE');}
    const px=pixelPrices.parse(z.object({pixel:z.unknown()}).parse(metadata).pixel);const sh=sheerPrices.parse(sheer.costs);
    const prices:Record<string,number>={...px,gemini_pro:sh.gemini.pro,gemini_plus:sh.gemini.plus,youtube:sh.youtube,spotify:sh.spotify,soundcloud:sh.soundcloud,perplexity:sh.perplexity};
    return jobs.map(job=>({id:job.id,name:job.name,description:job.kind==='pixel'?'本人 Gmail 账号任务。需要提交账号密码与双重验证密钥，供应商将处理该任务。':'面向符合资格客户的 SheerID 验证任务，需要客户提供本人验证链接。',price:prices[job.price]*this.coinToCny/this.usdToCny,inStock:true,delivery:{type:'custom'},inputKind:job.kind,initiallyEnabled:false}));
  }
  async product(id:string){const found=(await this.products()).find(p=>p.id===id);if(!found)throw new AppError(404,'任务类型不存在','SUPPLIER_404');return found;}
  async balance(){const data=await this.request<{ok:boolean;coins:number}>('/info');if(!data.ok||!Number.isFinite(data.coins))throw new AppError(502,'供应商余额响应异常','SUPPLIER_RESPONSE');return {balance:data.coins,membership:'coins'};}
  async purchase(input:{productId:string;quantity:number;serviceInput?:ServiceInput},_key:string):Promise<SupplierOrder>{
    if(input.quantity!==1 || !input.serviceInput)throw new AppError(400,'任务资料不完整','VALIDATION_ERROR');
    const job=jobs.find(j=>j.id===input.productId);if(!job || job.kind!==input.serviceInput.kind)throw new AppError(400,'任务资料与商品不匹配','VALIDATION_ERROR');
    let body:Record<string,unknown>;let route:string;
    if(input.serviceInput.kind==='pixel'){
      const [,mode]=job.id.split(':');const s=input.serviceInput;
      body={gmail:s.gmail,password:s.password,totp:s.totp,mode,...(s.backupCodes.length?{backup_codes:s.backupCodes}:{})};route='/pixel/submit';
    }else{
      const [,service,mode]=job.id.split(':');sheerId(input.serviceInput.link);
      body={link:input.serviceInput.link,service,...(mode?{mode}:{})};route='/sheerid/submit';
    }
    const data=await this.request<{ok:boolean;submitted:number;results?:{ok:boolean;job_id?:number|string}[]}>(route,{method:'POST',body:JSON.stringify(body)});
    const result=data.results?.[0],id=String(result?.job_id??'');
    if(!data.ok||data.submitted!==1||!result?.ok||!/^\d{1,20}$/.test(id))throw new AppError(502,'任务提交结果不明确，请在供货商后台核对','SUPPLIER_RESPONSE');
    return {orderId:`${job.kind}:${id}`,status:'paid',product:{id:job.id,name:job.name},quantity:1,activationInstructions:['任务已提交，正在等待供应商处理。']};
  }
  async order(id:string):Promise<SupplierOrder>{
    const match=/^(pixel|sheerid):(\d{1,20})$/.exec(id);if(!match)throw new AppError(400,'供货商任务编号无效','VALIDATION_ERROR');const kind=match[1],jobId=match[2];
    const data=await this.request<{ok:boolean;status:string;mode?:string;service?:string;email?:string;link?:string}>(`/${kind}/status/${jobId}`);
    if(!data.ok)throw new AppError(502,'供应商任务状态异常','SUPPLIER_RESPONSE');
    let productId:string,subjectHash:string;
    if(kind==='pixel'){
      if(!data.mode || !data.email)throw new AppError(502,'供应商任务缺少核对信息','SUPPLIER_RESPONSE');
      productId=`pixel:${data.mode}`;subjectHash=sha(`pixel:${data.email.toLowerCase()}`);
    }else{
      if(!data.service || !data.link)throw new AppError(502,'供应商任务缺少核对信息','SUPPLIER_RESPONSE');
      productId=`sheerid:${data.service}:${data.mode??''}`;subjectHash=sha(`sheerid:${sheerId(data.link)}`);
    }
    if(!jobs.some(j=>j.id===productId))throw new AppError(502,'供应商任务类型异常','SUPPLIER_RESPONSE');
    const state=data.status.toLowerCase();
    const status=state==='success'?'delivered':['pending','queued','running'].includes(state)?'paid':['failed','cancelled'].includes(state)?'failed':'';
    if(!status)throw new AppError(502,'供应商任务状态未知','SUPPLIER_RESPONSE');
    return {orderId:id,status,product:{id:productId,name:''},quantity:1,subjectHash,activationInstructions:status==='delivered'?['供货商已标记任务完成，请在对应服务中核对结果。']:status==='failed'?['供货商任务未完成，请联系店铺处理。']:['任务正在由供货商处理。']};
  }
  orders(){return this.request('/history');}
}
