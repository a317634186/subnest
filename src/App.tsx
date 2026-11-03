import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, Globe2, Grid2X2, Heart, Layers, LayoutGrid, LifeBuoy, LockKeyhole, Menu, PackageCheck, Search, ShieldCheck, ShoppingBag, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { api, channelNames, defaultSupport, money, type Product, type Receipt, type ShopConfig } from './api';
import { LanguageContext, Brand, Empty, ProductIcon, Spinner, useLang, errorText } from './ui';
import { Checkout, MyOrders, OrderDetail } from './Checkout';
import Admin from './Admin';
import { buildSearchIndex, searchAndSortProducts } from './search';

const PAGE_SIZE = 24;
const categories = [
  {id:'all',zh:'全部商品',en:'All products',icon:LayoutGrid},
  {id:'services',zh:'账号',en:'Accounts',icon:ShieldCheck},
  {id:'ai',zh:'AI 工具',en:'AI tools',icon:Sparkles},
  {id:'streaming',zh:'影音娱乐',en:'Entertainment',icon:AudioLines},
  {id:'design',zh:'创意设计',en:'Creative',icon:WandSparkles},
  {id:'tools',zh:'效率办公',en:'Productivity',icon:Grid2X2},
  {id:'vpn',zh:'VPN',en:'VPN',icon:LockKeyhole},
  {id:'gaming',zh:'游戏服务',en:'Gaming',icon:Layers},
];
function catalogTitle(product: Product, lang: string) {
  const title = (lang === 'en' && product.nameEn ? product.nameEn : product.name).trim();
  const segments = title.split(/\s*[–—]\s*/);
  if (segments.length < 2) return title;
  const brand = segments.shift()!.trim();
  const details = segments.join(' ').trim();
  const duration = details.match(/\b\d+(?:[.,]\d+)?\s*(?:days?|d|weeks?|months?|mos?|years?|yrs?|hours?|hrs?)\b|\d+(?:[.,]\d+)?\s*(?:天|日|个月|月|年|周|小时)/i)?.[0];
  if (!duration) return `${brand}｜${details}`;
  const spec = details.replace(duration, '').replace(/^[，,、:：|｜\s]+|[，,、:：|｜\s]+$/g, '').trim();
  return [brand, spec, duration].filter(Boolean).join('｜');
}

function productGroupKey(product: Product) {
  const base = (product.name || product.nameEn).split(/\s*[–—]\s*|\s+-\s+/)[0].trim().toLowerCase();
  return `${product.brand}:${base}`;
}

function groupProductVariants(products: Product[]) {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = productGroupKey(product);
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function CatalogCard({ variants, lang, rate, onBuy }: { variants: Product[]; lang: string; rate: number; onBuy: (p: Product) => void }) {
  const { t } = useLang();
  const [selectedId, setSelectedId] = useState(() => (variants.find(product => product.inStock) ?? variants[0])?.id ?? '');
  const product = variants.find(item => item.id === selectedId) ?? variants[0]!;
  const localizedTitle = lang === 'en' && product.nameEn ? product.nameEn : product.name;
  const displayTitle = variants.length > 1 ? localizedTitle.split(/\s*[–—]\s*|\s+-\s+/)[0] : catalogTitle(product, lang);
  const description = lang === 'en' ? product.descriptionEn : product.description;
  const sellingPoint = (description || '').split(/\n|(?<=[。！？.!?])\s/).map(line => line.trim()).find(Boolean) || '';

  return <article className={`product-card ${product.inStock ? 'in-stock' : 'out-of-stock'}`}>
    <div className="product-card-top"><ProductIcon brand={product.brand} name={`${product.name} ${product.nameEn}`}/><div className="product-card-badges">{(product.soldCount??0)>0&&<span className="sales-badge">{t(`已售 ${product.soldCount} 单`,`${product.soldCount} paid orders`)}</span>}{product.delivery !== 'instant' && <span className="delivery-label" title={product.requiresEmail ? t('需要邮箱开通','Email activation required') : t('由商家人工交付','Fulfilled manually')}><PackageCheck size={14}/><span>{product.requiresEmail ? t('邮箱开通','Email activation') : t('人工交付','Manual delivery')}</span></span>}</div></div>
    <div className="product-card-body"><h3 title={localizedTitle}>{displayTitle}</h3><p title={sellingPoint}>{sellingPoint}</p></div>
    {variants.length > 1 && <label className="variant-select"><span>{t('选择规格','Choose a specification')}</span><select value={product.id} onChange={event => setSelectedId(event.target.value)} aria-label={t('时长或设备规格','Duration or device specification')}>{variants.map(variant => <option key={variant.id} value={variant.id} disabled={!variant.inStock}>{variantLabel(variant, lang)} · {formatPrice(variant.priceCents, lang, rate)}{!variant.inStock ? ` · ${t('缺货','Sold out')}` : ''}</option>)}</select></label>}
    <div className="product-card-footer"><div className="price"><span>{lang === 'en' ? '$' : '¥'}</span>{money(product.priceCents, lang, rate)}<small>{t('元','USD')}</small></div><button type="button" className="buy-button" disabled={!product.inStock} onClick={() => onBuy(product)}>{product.inStock ? t('选购','Get it') : t('补货中','Sold out')}{product.inStock && <ArrowRight size={15}/>}</button></div>
  </article>;
}

function variantLabel(product: Product, lang: string) {
  const title = catalogTitle(product, lang);
  const parts = title.split('｜').slice(1);
  return parts.join('｜') || title;
}

function formatPrice(cents: number, lang: string, rate: number) {
  return `${lang === 'en' ? '$' : '¥'}${money(cents, lang, rate)}`;
}

const legalPageKeys = ['guide','faq-page','refunds','terms','privacy'] as const;
type LegalPageKey = typeof legalPageKeys[number];
function LegalPage({ page }: { page: LegalPageKey }) {
  const { lang, t } = useLang();
  const title: Record<LegalPageKey, [string,string]> = {
    guide: ['购买指南','Purchase guide'], 'faq-page': ['常见问题','Frequently asked questions'],
    refunds: ['售后与退款政策','Support & refund policy'], terms: ['服务条款','Terms of service'], privacy: ['隐私政策','Privacy policy'],
  };
  const faq = [
    [t('付款后在哪里查看订单？','Where can I find my order?'),t('在“我的订单”查看本机保存的记录，也可粘贴订单号与查询密钥找回。请妥善保存下单后提供的查询凭证。','Open My orders or recover an order with its ID and recovery key. Keep the receipt shown after checkout.')],
    [t('有哪些付款方式？','Which payment methods are available?'),t('以结算页当前显示的渠道为准。转账类订单由店铺人工核实到账。','Use the methods shown at checkout. Transfer payments are verified manually.')],
    [t('多久交付？','How long does delivery take?'),t('自动交付商品在核款后显示交付信息；需要邮箱开通或人工处理的商品会在订单页显示进度。具体以商品说明为准。','Automatic items show delivery after payment review. Email activation and manual orders show progress in the order page. Check the product description for specifics.')],
    [t('所有商品都自动发货吗？','Are all products delivered automatically?'),t('不是。购买前请查看商品卡片和详情中的交付方式。','No. Check the delivery method shown on the product card and details before purchase.')],
    [t('为什么需要联系邮箱？','Why is a contact email required?'),t('联系邮箱用于订单通知和必要的售后沟通；部分商品另需填写会员开通邮箱。','The contact email is used for order updates and support. Some products also require an activation email.')],
    [t('需要提交密码或验证码吗？','Will I need to submit a password or code?'),t('大多数卡密商品不需要。Pixel 任务可能要求 Gmail 与双重验证资料；SheerID 任务要求符合资格的验证链接，结算前会明确提示并征得授权。','Most code products do not. Pixel tasks may request Gmail and two-factor details; SheerID tasks require an eligible verification link. The checkout flow explains this and asks for consent.')],
    [t('可以修改规格或商品吗？','Can I change a product or specification?'),t('创建订单前可返回商品列表更改；订单创建后请先联系店铺处理，不要重复付款。','Change your selection before creating the order. After checkout, contact support and avoid paying again.')],
    [t('商品缺货怎么办？','What if a product is out of stock?'),t('缺货商品不能下单。可打开“显示缺货商品”查看，待店铺同步库存后再购买。','Out-of-stock items cannot be purchased. Enable Show sold-out and check again after inventory updates.')],
    [t('退款如何申请？','How do refunds work?'),t('请提供订单号与问题说明。店铺按商品页质保范围和售后政策核实后处理；具体资格依商品说明而定。','Contact support with your order ID and details. Requests are reviewed against the product warranty and policy; eligibility depends on the product terms.')],
    [t('退款多久到账？','How long do refunds take?'),t('核准后由店铺按原收款渠道办理，实际到账时间取决于支付渠道。','Approved refunds are sent through the original payment method. Posting time depends on the payment provider.')],
    [t('英文价格为什么和人民币不同？','Why is the USD price different?'),t('英文界面按店铺当前汇率将人民币标价换算为美元；最终应付金额以结算页为准。','The English interface converts CNY prices using the store exchange rate. Checkout shows the amount due.')],
    [t('更换设备后怎样找回订单？','How do I recover an order on a new device?'),t('粘贴完整的订单号与查询密钥。只有订单号无法查看交付信息。','Paste the full order ID and recovery key. The order ID alone cannot reveal delivery details.')],
  ];
  const guideSteps = [
    [t('1. 选择商品与规格','1. Choose a product and specification'),t('使用分类、搜索和价格筛选找到商品；确认时长、设备数、地区、库存及交付方式。','Filter by category, search or price. Check duration, device limit, region, stock and delivery method.')],
    [t('2. 核对说明并填写邮箱','2. Review terms and enter your email'),t('查看有效期、质保和使用步骤。需要邮箱开通的商品，每份填写一个正确的邮箱地址。','Review validity, warranty and usage steps. Enter one valid activation email per unit when required.')],
    [t('3. 按结算页完成付款','3. Pay using checkout instructions'),t('只使用结算页列出的渠道；转账后提交付款参考号，等待店铺核实。','Use a method listed at checkout. Submit the transfer reference and wait for payment review.')],
    [t('4. 保存凭证并查看订单','4. Save your receipt and check the order'),t('保存订单查询凭证，在“我的订单”查看交付结果或处理进度。','Save the order recovery key and check My orders for delivery or progress updates.')],
  ];
  const paragraphs: Record<Exclude<LegalPageKey,'faq-page'|'guide'>, [string,string][]> = {
    refunds: [
      [t('提交申请','Request review'),t('联系店铺并提供订单号、商品名称及问题说明。请勿公开发送密码、双重验证密钥或完整查询凭证。','Contact the store with your order ID, product name and issue. Do not post passwords, two-factor secrets or full recovery keys publicly.')],
      [t('审核范围','Review scope'),t('店铺依据商品页标注的有效期、交付方式和质保范围核实。商品已成功交付、激活或兑换后的处理方式以该商品详情为准。','The store reviews the product’s stated duration, delivery method and warranty. Terms for products already delivered, activated or redeemed follow that product’s details.')],
      [t('退款方式','Refund method'),t('核准的退款由店铺按原付款渠道处理；到账时间受支付渠道影响。未收到确认前，请勿重复支付。','Approved refunds are processed through the original payment method. Posting time depends on the provider. Do not pay again while awaiting confirmation.')],
    ],
    terms: [
      [t('订单与付款','Orders and payment'),t('商品、库存和价格以结算时显示为准。转账订单需核实实际到账后才开始交付。','Product, stock and price are confirmed at checkout. Transfer orders enter fulfillment after payment is verified.')],
      [t('使用资格','Eligibility'),t('购买者需有权使用所购账号、邮箱或服务。Pixel 与 SheerID 等任务仅可提交本人有权使用且符合服务资格的资料。','You must be authorized to use the purchased account or service. Pixel and SheerID tasks require information you are allowed to submit and eligibility for the service.')],
      [t('商品说明','Product details'),t('数字商品的地区、有效期、设备数、质保和交付方式因商品而异，请在付款前阅读对应商品说明。','Region, duration, device limits, warranty and delivery vary by product. Review its details before payment.')],
      [t('联系与处理','Support'),t('遇到订单问题请通过页面列出的联系方式联系店铺，并提供订单号；请勿重复创建或支付相同订单。','Contact the store using the listed support channels and include your order ID. Avoid duplicate orders or payments.')],
    ],
    privacy: [
      [t('收集的信息','Information collected'),t('下单时会处理联系邮箱、商品与规格、付款参考号和订单状态。特定任务可能需要 Pixel 登录资料或 SheerID 验证链接。','Checkout processes your contact email, product and specification, payment reference and order status. Some tasks require Pixel credentials or a SheerID verification link.')],
      [t('信息用途与共享','Use and sharing'),t('信息用于核款、交付、订单查询和售后。完成供货需要时，相关任务资料会发送给该商品对应的供货商；不会在商品交付之外用于其他用途。','Information supports payment review, fulfillment, order lookup and after-sales service. Task details are shared with the supplier for that product when needed for fulfillment.')],
      [t('安全与保存','Security and retention'),t('订单私密信息和供货商凭据使用服务器加密存储；订单查询需同时提供订单号与查询密钥。任务密码等资料会在任务处理后清除。订单记录按履约与售后需要保留。','Private order data and supplier credentials are encrypted at rest. Order lookup requires both an ID and recovery key. Task passwords and similar details are cleared after processing; order records are retained for fulfillment and support.')],
      [t('联系隐私问题','Privacy requests'),t('如需咨询或提出隐私相关请求，请通过客服邮箱联系，并提供订单号以便核实。','For privacy questions or requests, contact the support email and include an order ID so the request can be verified.')],
    ],
  };
  return <main className="container legal-page" id="page-top"><span className="eyebrow">SUBNEST · {t('信息中心','HELP CENTER')}</span><h1>{t(...title[page])}</h1>{page==='guide' ? <div className="legal-steps">{guideSteps.map(([heading,body])=><section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}</div> : page==='faq-page' ? <div className="faq-list legal-faq">{faq.map(([question,answer])=><details key={question}><summary>{question}<ChevronDown size={18}/></summary><p>{answer}</p></details>)}</div> : <div className="legal-steps">{paragraphs[page].map(([heading,body])=><section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}</div>}<a className="button secondary legal-back" href="#catalog">{t('返回商品列表','Back to products')}</a></main>;
}

function Shop({ products, config, loading, error, onBuy, reload }: { products: Product[]; config?: ShopConfig; loading: boolean; error: string; onBuy: (p:Product) => void; reload: () => void }) {
  const supportEmail = config?.supportEmail || defaultSupport.email;
  const supportWechat = config?.supportWechat || defaultSupport.wechat;
  const supportTelegram = config?.supportTelegram || defaultSupport.telegram;
  const supportTelegramUrl = supportTelegram.startsWith('http') ? supportTelegram : `https://${supportTelegram}`;
  const { lang,t } = useLang();
  const rate = config?.exchangeRate || 7.2;
  const [category,setCategory] = useState('all');
  const [search,setSearch] = useState('');
  const [sort,setSort] = useState('default');
  const [showOutOfStock,setShowOutOfStock] = useState(false);
  const [minPrice,setMinPrice] = useState('');
  const [maxPrice,setMaxPrice] = useState('');
  const [visibleCount,setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const indexed = useMemo(() => buildSearchIndex(products), [products]);

  const baseMatched = useMemo(
    () => searchAndSortProducts(indexed, { query: search, category, sort }),
    [indexed, category, search, sort]
  );

  const minCents = minPrice === '' ? 0 : Math.max(0, Number(minPrice) * (lang === 'en' ? rate * 100 : 100));
  const maxCents = maxPrice === '' ? Infinity : Math.max(0, Number(maxPrice) * (lang === 'en' ? rate * 100 : 100));
  const filtered = useMemo(() => baseMatched.filter(product => product.priceCents >= minCents && product.priceCents <= maxCents), [baseMatched, minCents, maxCents]);
  const inStockCount = useMemo(() => filtered.filter(p => p.inStock).length, [filtered]);
  const outOfStockCount = filtered.length - inStockCount;

  const displayProducts = useMemo(() => {
    const available = filtered.filter(p => p.inStock);
    const productsToShow = showOutOfStock ? [...available, ...filtered.filter(p => !p.inStock)] : available;
    return groupProductVariants(productsToShow);
  }, [filtered, showOutOfStock]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, search, sort, showOutOfStock, minPrice, maxPrice]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleCount >= displayProducts.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(c => Math.min(displayProducts.length, c + PAGE_SIZE));
      }
    }, { rootMargin: '320px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, displayProducts.length]);

  const visibleProducts = useMemo(() => displayProducts.slice(0, visibleCount), [displayProducts, visibleCount]);
  const featuredProducts = useMemo(() => [...products].filter(product => product.inStock).sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 3), [products]);

  function browse() { document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'}); }
  const availablePaymentNames = config?.demo
    ? t('演示付款','Demo payment')
    : config?.channels.length
      ? config.channels.map(channel => t(...(channelNames[channel.id] || [channel.id, channel.id]))).join('、')
      : t('暂未启用','Unavailable');
  const faqs = [
    [t('购买后在哪里领取商品？','Where do I receive my purchase?'), t('付款由店铺核实到账后安排交付。自动交付商品会在私密订单页显示卡密；需要邮箱开通的商品会显示开通进度和使用说明。请下载并妥善保存订单查询凭证。','Once the store verifies payment, automatic products appear in your private order page. Email activation products show their progress and instructions there. Download and keep your recovery key.')],
    [t('可以使用哪些付款方式？','How can I pay?'), t(`当前可用：${availablePaymentNames}。订单以人民币计价，请按结算页说明完成付款；人工核实到账后安排交付。`,`Currently available: ${availablePaymentNames}. Prices are displayed in USD at the store exchange rate. Follow the checkout instructions; delivery starts after payment is verified.`)],
    [t('需要填写自己的账号密码吗？','Do I need to share my password?'), t('普通卡密商品不需要提供原账号密码；部分 Pixel 账号任务在核款后需要密码及双重验证密钥，并会事先说明、征求你的授权。SheerID 任务需要本人且符合资格的验证链接。','Key products do not need your existing password. Some Pixel tasks require your password and two-factor secret after payment review, with your consent. SheerID tasks require your own eligible verification link.')],
    [t('遇到交付问题怎么办？','What if there is a delivery issue?'), t('先在“我的订单”中查看最新状态。若显示店铺处理中，请勿重复付款，提供订单号联系店铺核对处理或申请退款。退款由店铺人工核对后通过原收款渠道办理。','Check the latest status in My orders. If your order needs store assistance, do not pay again. Contact the store with your order ID for resolution or a refund, which is reviewed and processed manually through the payment channel.')],
  ];
  const paymentLabel = config?.demo
    ? t('演示付款','Demo payment')
    : config?.channels.length
      ? config.channels.map(channel => t(...(channelNames[channel.id] || [channel.id, channel.id]))).join(' · ')
      : t('请以结算页显示为准','See available methods at checkout');
  return <>
    <main className="container">
      <section className="hero">
        <div className="hero-copy"><div className="hero-eyebrow"><span/>{t('订阅集 · 数字会员商城','SUBNEST · DIGITAL MEMBERSHIPS')}</div><h1>{t('AI工具、影音与办公会员，','AI, entertainment and work tools.')}<br/><span>{t('一站选购，订单进度随时可查。','Choose in one place. Track every order.')}</span></h1><p>{t('按商品说明完成交付，自动发货商品核款后即可在订单页查看。','Delivery follows each product’s terms. Automatic items appear in your order after payment review.')}</p><div className="hero-actions"><button className="button primary" onClick={browse}>{t('探索商品','Explore products')}<ArrowRight size={18}/></button><a href="#guide" className="hero-secondary">{t('购买指南','Purchase guide')}<ArrowDown size={15}/></a></div><div className="hero-footnote"><ShieldCheck size={16}/><span>{t('私密订单','Private orders')}</span><i/><span>{paymentLabel}</span><i/><span>{t('清晰交付进度','Clear delivery updates')}</span></div>{featuredProducts.length>0&&<div className="hero-featured"><strong>{t('精选现货','Featured in stock')}</strong><div>{featuredProducts.map(product=><button type="button" key={product.id} onClick={()=>onBuy(product)}><ProductIcon brand={product.brand} name={`${product.name} ${product.nameEn}`} small/><span>{lang==='en'&&product.nameEn?product.nameEn:product.name}</span><b>{formatPrice(product.priceCents,lang,rate)}</b></button>)}</div></div>}</div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-star star-one">✳</span><span className="art-star star-two">✦</span><div className="floating-card card-ai"><ProductIcon brand="chatgpt" small/><span>{t('灵感，从此自由。','Ideas, unlocked.')}<small>{t('ChatGPT Plus 会员','ChatGPT Plus')}</small></span><span className="mini-spark">✧</span></div><div className="membership-card"><div className="membership-top"><Layers size={24}/><span>{t('订阅集','SubNest')}<span>{t('精选数字会员','THE DIGITAL COLLECTION')}</span></span><Globe2 size={20}/></div><div className="membership-title">{t('一份好订阅，','Small subscriptions.')}<br/>{t('开启无限可能。','Endless possibilities.')}</div><div className="membership-bottom"><div className="mini-brands"><span>N</span><MusicIcon/><span>C</span><span>✧</span></div><span>{t('为每一天添彩','Made for your everyday')} <Heart size={11}/></span></div></div><div className="floating-card card-music"><ProductIcon brand="spotify" small/><div><span>{t('让音乐融入日常。','Your daily soundtrack.')}</span><div className="sound-wave">{Array.from({length:17},(_,i) => <i key={i} style={{height: `${8 + (i * 13 % 23)}px`}}/>)}</div></div><span className="play-circle">▶</span></div><div className="art-caption"><span>✦</span> {t('工作 · 娱乐 · 创作 · 每一天','Work. Play. Create. Repeat.')}</div></div>
      </section>
      <div className="benefits"><div><Zap/><span><strong>{t('交付更省心','Simple fulfillment')}</strong><small>{t('核款后发货，进度随时可查','Track delivery after payment review')}</small></span></div><div><ShieldCheck/><span><strong>{t('订单有保障','Private by design')}</strong><small>{t('专属查询凭证，保护交付信息','Your delivery stays behind your key')}</small></span></div><div><Globe2/><span><strong>{t('好体验不设限','A world of possibilities')}</strong><small>{t('数字会员与效率工具，一站选购','Memberships and tools in one place')}</small></span></div><div><LifeBuoy/><span><strong>{t('服务有回应','Help when you need it')}</strong><small>{t('保留订单号，方便售后处理','Order references make support easier')}</small></span></div></div>
      <section className="trust-strip" aria-label={t('服务信息','Service information')}><div><ShieldCheck/><span><strong>{t('商品质保','Product warranty')}</strong><small>{t('按各商品页标注范围处理','Coverage shown on each product')}</small></span></div><div><LockKeyhole/><span><strong>{t('订单查询凭证','Order recovery key')}</strong><small>{t('订单号需与查询密钥配合使用','Order ID and key are both required')}</small></span></div>{(config?.confirmedOrderCount??0)>0&&<div><Check/><span><strong>{t('已核实付款订单',`Confirmed paid orders`)}</strong><small>{config!.confirmedOrderCount}</small></span></div>}</section>
      <section id="catalog" className="catalog-section"><div className="section-heading"><div><span className="eyebrow">{t('精选日常数字好物','CURATED FOR YOUR EVERYDAY')}</span><h2>{t('发现你的下一份订阅','Find your next favorite')}<span className="heading-dot">.</span></h2><p>{t('工作更高效，娱乐更尽兴。总有一款适合你。','Work a little smarter. Unwind a little better. Make it yours.')}</p></div><div className="search-box"><Search size={18}/><input aria-label={t('搜索商品','Search products')} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('搜索品牌、名称或别名（如 ChatGPT / 剪映 / 油管）…','Search brand or product (e.g. ChatGPT, CapCut, YouTube)…')}/>{search ? <button type="button" className="search-clear" aria-label={t('清空搜索','Clear search')} onClick={()=>setSearch('')}>×</button> : <kbd>⌕</kbd>}</div></div>
        <div className="catalog-toolbar"><div className="category-tabs">{categories.map(c=><button type="button" className={category===c.id?'active':''} key={c.id} onClick={()=>setCategory(c.id)}><c.icon size={16}/>{t(c.zh,c.en)}</button>)}</div><div className="catalog-controls"><label className="show-out-toggle"><input type="checkbox" checked={showOutOfStock} onChange={e=>setShowOutOfStock(e.target.checked)}/><span>{t(`显示缺货商品 (${outOfStockCount})`,`Show sold-out (${outOfStockCount})`)}</span></label><div className="price-range"><span>{t('价格','Price')}</span><input type="number" min="0" step="1" value={minPrice} onChange={e=>setMinPrice(e.target.value)} aria-label={t('最低价格','Minimum price')} placeholder={t('最低','Min')}/><span>–</span><input type="number" min="0" step="1" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} aria-label={t('最高价格','Maximum price')} placeholder={t('最高','Max')}/><small>{lang==='en'?'USD':'CNY'}</small></div><select aria-label={t('商品排序','Sort products')} value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">{t('按销量','Best selling')}</option><option value="default">{t('默认：有货优先','In stock first')}</option><option value="low">{t('价格从低到高','Price: low to high')}</option><option value="high">{t('价格从高到低','Price: high to low')}</option><option value="newest">{t('最近更新','Recently updated')}</option></select></div></div>
        {loading ? <div className="loading"><Spinner/>{t('正在整理好物…','Loading the collection…')}</div> : error ? <div className="empty"><p className="error">{error}</p><button className="button secondary" onClick={reload}>{t('重新加载','Try again')}</button></div> : !displayProducts.length ? <Empty title={t('暂时没有匹配的商品','No matches just yet')} text={t('换个关键词、分类或打开“显示缺货商品”试试。','Try another search or enable “Show sold-out”.')}/> : <>
          <div className="product-grid">{visibleProducts.map(variants=><CatalogCard key={productGroupKey(variants[0]!)} variants={variants} lang={lang} rate={rate} onBuy={onBuy}/>)}</div>
          {visibleCount < displayProducts.length && <div className="catalog-more" ref={loadMoreRef}>
            <button type="button" className="button secondary" onClick={()=>setVisibleCount(c=>Math.min(displayProducts.length,c+PAGE_SIZE*2))}>{t(`加载更多商品（已显示 ${visibleProducts.length} / ${displayProducts.length} 件）`,`Load more (${visibleProducts.length} / ${displayProducts.length} shown)`)}</button>
          </div>}
        </>}
        <div className="catalog-bottom"><span><Check size={14}/>{t('售价以结算页为准，购买前请查看商品详情。','Review product details and the final price before checkout.')}</span><span>{t(`共 ${displayProducts.length} 件精选商品`,`${displayProducts.length} products in this collection`)}</span></div>
      </section>
      <section id="how-it-works" className="how-section"><div><span className="eyebrow">{t('简单三步 · 轻松拥有','THREE LITTLE STEPS')}</span><h2>{t('喜欢，就这么简单。','A little less effort.\nA lot more possibility.')}</h2><p>{t('从选购到拥有，每一步都清清楚楚。','From finding your favorite to making it yours.')}</p></div><div className="steps">{[[t('挑选心仪商品','Find your favorite'),t('查看详情，选择适合自己的会员方案。','Explore the details and choose a plan that fits.')],[t('完成付款核验','Pay your way'),t('按说明付款，提交参考号等待确认。','Follow the instructions and submit your payment reference.')],[t('领取你的精彩','Enjoy what’s next'),t('保存查询凭证，在订单页查看交付。','Keep your recovery key and find your delivery in your order.')]].map(([title,desc],i)=><div className="step" key={title}><span>0{i+1}</span><h3>{title}</h3><p>{desc}</p></div>)}</div></section>
      <section id="faq" className="faq-section"><div><span className="eyebrow">{t('购买前必读','GOOD TO KNOW')}</span><h2>{t('还有一点小疑问？','A few things to know.')}<CircleHelp size={25}/></h2><p>{t('关于购买，你可能想了解这些。','A little clarity before you get started.')}</p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<ChevronDown size={18}/></summary><p>{a}</p></details>)}</div></section>
      <section id="contact" className="contact-section"><div className="contact-copy"><span className="eyebrow">{t('官方售后客服','CUSTOMER SUPPORT')}</span><h2>{t('遇到问题？联系客服','Need help? Contact us')}</h2><p>{t('如遇付款核实、商品交付或账号问题，请附上订单号通过以下方式联系我们：','If you run into any payment, delivery or account issue, reach out with your order ID:')}</p></div><div className="contact-cards"><a className="contact-card" href={`mailto:${supportEmail}`}><span className="contact-label">{t('邮件 / Email','Email')}</span><strong className="support-email">{supportEmail}</strong></a><div className="contact-card"><span className="contact-label">{t('微信 / WeChat','WeChat')}</span><strong>{supportWechat}</strong></div><a className="contact-card" href={supportTelegramUrl} target="_blank" rel="noopener noreferrer"><span className="contact-label">Telegram</span><strong>{supportTelegram}</strong></a></div></section>
    </main>
  </>;
}
function MusicIcon() { return <span>♫</span>; }
function Root() {
  const {lang,t,setLang}=useLang(); const [config,setConfig]=useState<ShopConfig>(); const [products,setProducts]=useState<Product[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const footerPaymentLabel = config?.demo ? t('演示付款','Demo payment') : config?.channels.length ? config.channels.map(channel=>t(...(channelNames[channel.id]||[channel.id,channel.id]))).join(' · ') : t('请以结算页显示为准','See checkout for available methods');
  const [route,setRoute]=useState(location.hash); const [selected,setSelected]=useState<Product>(); const [receipt,setReceipt]=useState<Receipt>();
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const legalPage = legalPageKeys.find(key => route === `#${key}`);
  useEffect(()=>{ const change=()=>{setRoute(location.hash);setMobileMenuOpen(false); if(['#orders','#admin','',...legalPageKeys.map(key=>`#${key}`)].includes(location.hash)) window.scrollTo({top:0});}; window.addEventListener('hashchange',change); return()=>window.removeEventListener('hashchange',change); },[]);
  async function load(silent = false){if(!silent)setLoading(true);setError('');try {const [c,p]=await Promise.all([api<ShopConfig>('/config'),api<{products:Product[]}>('/products')]);setConfig(c);setProducts(p.products);}catch(e){setError(errorText(e,lang));}finally{if(!silent)setLoading(false);}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    const title=lang==='zh'?'订阅集 SubNest｜AI工具、影音与办公会员':'SubNest | AI, entertainment and productivity memberships';
    const description=lang==='zh'?'订阅集 SubNest，一站选购 AI 工具、影音娱乐与办公会员。查看商品说明、付款方式和订单交付进度。':'Shop AI tools, entertainment and productivity memberships at SubNest. Review product terms, available payment methods and order progress.';
    document.title=title;
    const setMeta=(selector:string,attribute:string,value:string)=>{let node=document.head.querySelector<HTMLMetaElement>(selector);if(!node){node=document.createElement('meta');document.head.appendChild(node);}node.setAttribute(attribute,value);};
    setMeta('meta[name="description"]','content',description);setMeta('meta[property="og:title"]','content',title);setMeta('meta[property="og:description"]','content',description);setMeta('meta[property="og:url"]','content',location.origin);setMeta('meta[property="og:image"]','content',`${location.origin}/og.png`);setMeta('meta[name="twitter:title"]','content',title);setMeta('meta[name="twitter:description"]','content',description);setMeta('meta[name="twitter:image"]','content',`${location.origin}/og.png`);
    let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=location.origin;
    const list=products.slice(0,24).map(product=>({'@type':'Product',name:lang==='en'&&product.nameEn?product.nameEn:product.name,description:(lang==='en'&&product.descriptionEn?product.descriptionEn:product.description).slice(0,500),sku:product.id,brand:{'@type':'Brand',name:product.brand},offers:{'@type':'Offer',price:(product.priceCents/100).toFixed(2),priceCurrency:'CNY',availability:product.inStock?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:`${location.origin}/#catalog`}}));
    let schema=document.getElementById('subnest-product-schema');if(!schema){schema=document.createElement('script');schema.id='subnest-product-schema';schema.setAttribute('type','application/ld+json');document.head.appendChild(schema);}schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:title,itemListElement:list.map((item,index)=>({'@type':'ListItem',position:index+1,item}))});
  },[lang,products]);
  useEffect(()=>{ if (['#catalog','#faq','#how-it-works','#contact'].includes(route)) requestAnimationFrame(()=>document.getElementById(route.slice(1))?.scrollIntoView()); },[route]);
  return <><div className="announcement"><span>✦</span>{t(config?.announcementZh || '把更好的数字生活，放进你的日常。', config?.announcementEn || 'Your everyday, with a little more possibility.')}<span className="announcement-right">{config?.demo?t('演示体验 · 不发生真实扣款','DEMO · NO REAL CHARGES'):t('数字商品 · 订单私密交付','DIGITAL GOODS · PRIVATE DELIVERY')}</span></div><header className="site-header"><div className="container header-inner"><Brand name/><nav className={mobileMenuOpen?'nav-open':''} aria-label={t('主导航','Main navigation')}><a className={!['#orders','#admin'].includes(route)?'active':''} href="#catalog">{t('探索商品','Discover')}</a><a href="#guide">{t('购买指南','Purchase guide')}</a><a href="#faq-page">{t('常见问题','FAQs')}</a><a href="#contact">{t('联系客服','Contact')}</a></nav><div className="header-actions"><button type="button" className="menu-toggle" aria-label={t('打开导航','Open navigation')} aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(open=>!open)}><Menu size={20}/></button><div className="language-switch" role="group" aria-label={t('切换语言','Switch language')}><Globe2 size={15}/><button type="button" className={lang==='zh'?'active':''} onClick={()=>setLang('zh')}>中文</button><button type="button" className={lang==='en'?'active':''} onClick={()=>setLang('en')}>EN</button></div><span className="header-divider"/><a className={`orders-link ${route==='#orders'?'active':''}`} href="#orders"><ShoppingBag size={18}/><span>{t('我的订单','My orders')}</span></a></div></div></header>
    {route==='#admin'?<Admin onCatalogChange={()=>void load(true)}/>:route==='#orders'?<MyOrders config={config} onOpen={setReceipt}/>:legalPage?<LegalPage page={legalPage}/>:<Shop products={products} config={config} loading={loading} error={error} onBuy={setSelected} reload={()=>void load()}/>}
    <footer className="site-footer"><div className="container footer-main"><div><Brand name/><p>{t('好用的订阅，好一点的每一天。','Good subscriptions. Better little everyday moments.')}</p><div className="footer-contacts"><a href={`mailto:${config?.supportEmail||defaultSupport.email}`}>{t('邮件','Email')}: {config?.supportEmail||defaultSupport.email}</a><span>{t('微信','WeChat')}: {config?.supportWechat||defaultSupport.wechat}</span><a href={(config?.supportTelegram||defaultSupport.telegram).startsWith('http')?(config?.supportTelegram||defaultSupport.telegram):`https://${config?.supportTelegram||defaultSupport.telegram}`} target="_blank" rel="noopener noreferrer">TG: {config?.supportTelegram||defaultSupport.telegram}</a></div></div><div className="footer-links"><a href="#guide">{t('购买指南','Purchase guide')}</a><a href="#faq-page">{t('常见问题','FAQs')}</a><a href="#refunds">{t('售后与退款','Support & refunds')}</a><a href="#terms">{t('服务条款','Terms')}</a><a href="#privacy">{t('隐私政策','Privacy')}</a><a href="#contact">{t('联系店铺','Contact us')}</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} SubNest · {t('订阅集','The digital collection')}</span><span><LockKeyhole size={13}/>{t('私密交付，用心服务','Private deliveries. Thoughtful service')}</span><span>{footerPaymentLabel}</span></div></footer>
    {selected&&config&&<Checkout product={selected} config={config} onClose={()=>setSelected(undefined)} onOrder={r=>{setSelected(undefined);setReceipt(r);}}/>}
    {receipt&&config&&<OrderDetail receipt={receipt} config={config} onClose={()=>setReceipt(undefined)}/>}
  </>;
}
export default function App(){const [lang,setLangState]=useState<'zh'|'en'>(()=>localStorage.getItem('subnest-lang')==='en'?'en':'zh');const setLang=(next:'zh'|'en')=>{localStorage.setItem('subnest-lang',next);setLangState(next);};useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=lang==='zh'?'订阅集 SubNest｜AI工具、影音与办公会员':'SubNest | AI, entertainment and productivity memberships';},[lang]);return <LanguageContext.Provider value={{lang,setLang,toggle:()=>setLang(lang==='zh'?'en':'zh')}}><Root/></LanguageContext.Provider>;}
