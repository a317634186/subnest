import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, Globe2, Grid2X2, Heart, Layers, LayoutGrid, LifeBuoy, LockKeyhole, PackageCheck, Search, ShieldCheck, ShoppingBag, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { api, defaultSupport, money, type Product, type Receipt, type ShopConfig } from './api';
import { LanguageContext, Brand, Empty, ProductIcon, Spinner, useLang, errorText } from './ui';
import { Checkout, MyOrders, OrderDetail } from './Checkout';
import Admin from './Admin';
import { buildSearchIndex, searchAndSortProducts } from './search';

const PAGE_SIZE = 24;
const categories = [
  {id:'all',zh:'全部商品',en:'All products',icon:LayoutGrid},
  {id:'services',zh:'账号与验证',en:'Account services',icon:ShieldCheck},
  {id:'ai',zh:'AI 工具',en:'AI tools',icon:Sparkles},
  {id:'streaming',zh:'影音娱乐',en:'Entertainment',icon:AudioLines},
  {id:'design',zh:'创意设计',en:'Creative',icon:WandSparkles},
  {id:'tools',zh:'效率办公',en:'Productivity',icon:Grid2X2},
  {id:'gaming',zh:'游戏服务',en:'Gaming',icon:Layers},
];
const categoryMap = new Map(categories.map(c => [c.id, c]));

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
  const [visibleCount,setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const indexed = useMemo(() => buildSearchIndex(products), [products]);

  const filtered = useMemo(
    () => searchAndSortProducts(indexed, { query: search, category, sort }),
    [indexed, category, search, sort]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, search, sort]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleCount >= filtered.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(c => Math.min(filtered.length, c + PAGE_SIZE));
      }
    }, { rootMargin: '320px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length]);

  const visibleProducts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  function browse() { document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'}); }
  const faqs = [
    [t('购买后在哪里领取商品？','Where do I receive my purchase?'), t('付款由店铺核实到账后安排交付。自动交付商品会在私密订单页显示卡密；需要邮箱开通的商品会显示开通进度和使用说明。请下载并妥善保存订单查询凭证。','Once the store verifies payment, automatic products appear in your private order page. Email activation products show their progress and instructions there. Download and keep your recovery key.')],
    [t('可以使用哪些付款方式？','How can I pay?'), t('支持店铺启用的支付宝、微信、银行卡和币安转账。订单以人民币计价，按收款页说明完成转账并提交交易参考号；店铺核实实际到账后才会发货。','Use the Alipay, WeChat, bank or Binance transfer methods enabled by the store. Prices are displayed in USD (converted at the store exchange rate). Follow the payment instructions and submit your transaction reference for manual review.')],
    [t('需要填写自己的账号密码吗？','Do I need to share my password?'), t('普通卡密商品不需要提供原账号密码；部分 Pixel 账号任务在核款后需要密码及双重验证密钥，并会事先说明、征求你的授权。SheerID 任务需要本人且符合资格的验证链接。','Key products do not need your existing password. Some Pixel tasks require your password and two-factor secret after payment review, with your consent. SheerID tasks require your own eligible verification link.')],
    [t('遇到交付问题怎么办？','What if there is a delivery issue?'), t('先在“我的订单”中查看最新状态。若显示店铺处理中，请勿重复付款，提供订单号联系店铺核对处理或申请退款。退款由店铺人工核对后通过原收款渠道办理。','Check the latest status in My orders. If your order needs store assistance, do not pay again. Contact the store with your order ID for resolution or a refund, which is reviewed and processed manually through the payment channel.')],
  ];
  return <>
    <main className="container">
      <section className="hero">
        <div className="hero-copy"><div className="hero-eyebrow"><span/>{t('给数字生活，一点升级','A LITTLE UPGRADE FOR YOUR DIGITAL LIFE')}</div><h1>{t('你的精彩生活，','More of what you love.')}<br/><span>{t('从一份好订阅开始。','All in one little nest.')}</span></h1><p>{t('从灵感迸发到放松时刻，精选全球数字会员。','From a spark of inspiration to your favorite downtime.')}<br/>{t('把喜欢的工具与体验，轻松收入囊中。','Find the memberships that make every day a little better.')}</p><div className="hero-actions"><button className="button primary" onClick={browse}>{t('探索全部商品','Explore the collection')}<ArrowRight size={18}/></button><a href="#how-it-works" className="hero-secondary">{t('了解购买流程','How it works')}<ArrowDown size={15}/></a></div><div className="hero-footnote"><ShieldCheck size={16}/><span>{t('私密订单','Private orders')}</span><i/><span>{t('多种支付方式','Flexible payments')}</span><i/><span>{t('清晰交付进度','Clear delivery updates')}</span></div></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-star star-one">✳</span><span className="art-star star-two">✦</span><div className="floating-card card-ai"><ProductIcon brand="chatgpt" small/><span>{t('灵感，从此自由。','Ideas, unlocked.')}<small>{t('ChatGPT Plus 会员','ChatGPT Plus')}</small></span><span className="mini-spark">✧</span></div><div className="membership-card"><div className="membership-top"><Layers size={24}/><span>{t('订阅集','SubNest')}<span>{t('精选数字会员','THE DIGITAL COLLECTION')}</span></span><Globe2 size={20}/></div><div className="membership-title">{t('一份好订阅，','Small subscriptions.')}<br/>{t('开启无限可能。','Endless possibilities.')}</div><div className="membership-bottom"><div className="mini-brands"><span>N</span><MusicIcon/><span>C</span><span>✧</span></div><span>{t('为每一天添彩','Made for your everyday')} <Heart size={11}/></span></div></div><div className="floating-card card-music"><ProductIcon brand="spotify" small/><div><span>{t('让音乐融入日常。','Your daily soundtrack.')}</span><div className="sound-wave">{Array.from({length:17},(_,i) => <i key={i} style={{height: `${8 + (i * 13 % 23)}px`}}/>)}</div></div><span className="play-circle">▶</span></div><div className="art-caption"><span>✦</span> {t('工作 · 娱乐 · 创作 · 每一天','Work. Play. Create. Repeat.')}</div></div>
      </section>
      <div className="benefits"><div><Zap/><span><strong>{t('交付更省心','Simple fulfillment')}</strong><small>{t('核款后发货，进度随时可查','Track delivery after payment review')}</small></span></div><div><ShieldCheck/><span><strong>{t('订单有保障','Private by design')}</strong><small>{t('专属查询凭证，保护交付信息','Your delivery stays behind your key')}</small></span></div><div><Globe2/><span><strong>{t('好体验不设限','A world of possibilities')}</strong><small>{t('数字会员与效率工具，一站选购','Memberships and tools in one place')}</small></span></div><div><LifeBuoy/><span><strong>{t('服务有回应','Help when you need it')}</strong><small>{t('保留订单号，方便售后处理','Order references make support easier')}</small></span></div></div>
      <section id="catalog" className="catalog-section"><div className="section-heading"><div><span className="eyebrow">{t('精选日常数字好物','CURATED FOR YOUR EVERYDAY')}</span><h2>{t('发现你的下一份订阅','Find your next favorite')}<span className="heading-dot">.</span></h2><p>{t('工作更高效，娱乐更尽兴。总有一款适合你。','Work a little smarter. Unwind a little better. Make it yours.')}</p></div><div className="search-box"><Search size={18}/><input aria-label={t('搜索商品','Search products')} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('搜索品牌、名称或别名（如 ChatGPT / 剪映 / 油管）…','Search brand or product (e.g. ChatGPT, CapCut, YouTube)…')}/>{search ? <button type="button" className="search-clear" aria-label={t('清空搜索','Clear search')} onClick={()=>setSearch('')}>×</button> : <kbd>⌕</kbd>}</div></div>
        <div className="catalog-toolbar"><div className="category-tabs">{categories.map(c=><button type="button" className={category===c.id?'active':''} key={c.id} onClick={()=>setCategory(c.id)}><c.icon size={16}/>{t(c.zh,c.en)}</button>)}</div><select aria-label={t('商品排序','Sort products')} value={sort} onChange={e=>setSort(e.target.value)}><option value="default">{t('默认：有货优先','In stock first')}</option><option value="low">{t('价格从低到高','Price: low to high')}</option><option value="high">{t('价格从高到低','Price: high to low')}</option></select></div>
        {loading ? <div className="loading"><Spinner/>{t('正在整理好物…','Loading the collection…')}</div> : error ? <div className="empty"><p className="error">{error}</p><button className="button secondary" onClick={reload}>{t('重新加载','Try again')}</button></div> : !filtered.length ? <Empty title={t('暂时没有匹配的商品','No matches just yet')} text={t('换个关键词或分类试试；店铺也可能还未上架商品。','Try another search or category. New products may be on their way.')}/> : <>
          <div className="product-grid">{visibleProducts.map(p=>{
            const cat = categoryMap.get(p.category);
            return <article className={`product-card ${!p.inStock?'out-of-stock':''}`} key={p.id}><div className="product-card-top"><ProductIcon brand={p.brand} name={`${p.name} ${p.nameEn}`}/><span className={`delivery-label ${p.delivery==='instant'?'instant':''}`}>{p.delivery==='instant'?<Zap size={12}/>:<PackageCheck size={12}/>} {p.delivery==='instant'?t('自动交付','Auto delivery'):p.requiresEmail?t('邮箱开通','Email activation'):t('人工交付','Manual delivery')}</span></div><div className="product-card-body"><span className="product-category">{t(cat?.zh??'数字商品',cat?.en??'Digital product')}{p.demo&&<span> · {t('演示','DEMO')}</span>}</span><h3>{lang==='en'&&p.nameEn?p.nameEn:p.name}</h3><p>{lang==='en'?(p.descriptionEn||t('','See product details for the subscription terms, region and delivery requirements.')):p.description}</p></div><div className="product-card-footer"><div className="price"><span>{lang==='en'?'$':'¥'}</span>{money(p.priceCents,lang,rate)}<small>{t('元','USD')}</small></div><button type="button" className="buy-button" disabled={!p.inStock} onClick={()=>onBuy(p)}>{p.inStock?t('选购','Get it'):t('补货中','Sold out')}{p.inStock&&<ArrowRight size={15}/>}</button></div></article>;
          })}</div>
          {visibleCount < filtered.length && <div className="catalog-more" ref={loadMoreRef}>
            <button type="button" className="button secondary" onClick={()=>setVisibleCount(c=>Math.min(filtered.length,c+PAGE_SIZE*2))}>{t(`加载更多商品（已显示 ${visibleProducts.length} / ${filtered.length} 件）`,`Load more (${visibleProducts.length} / ${filtered.length} shown)`)}</button>
          </div>}
        </>}
        <div className="catalog-bottom"><span><Check size={14}/>{t('售价以结算页为准，购买前请查看商品详情。','Review product details and the final price before checkout.')}</span><span>{t(`共 ${filtered.length} 件精选商品`,`${filtered.length} products in this collection`)}</span></div>
      </section>
      <section id="how-it-works" className="how-section"><div><span className="eyebrow">{t('简单三步 · 轻松拥有','THREE LITTLE STEPS')}</span><h2>{t('喜欢，就这么简单。','A little less effort.\nA lot more possibility.')}</h2><p>{t('从选购到拥有，每一步都清清楚楚。','From finding your favorite to making it yours.')}</p></div><div className="steps">{[[t('挑选心仪商品','Find your favorite'),t('查看详情，选择适合自己的会员方案。','Explore the details and choose a plan that fits.')],[t('完成付款核验','Pay your way'),t('按说明付款，提交参考号等待确认。','Follow the instructions and submit your payment reference.')],[t('领取你的精彩','Enjoy what’s next'),t('保存查询凭证，在订单页查看交付。','Keep your recovery key and find your delivery in your order.')]].map(([title,desc],i)=><div className="step" key={title}><span>0{i+1}</span><h3>{title}</h3><p>{desc}</p></div>)}</div></section>
      <section id="faq" className="faq-section"><div><span className="eyebrow">{t('购买前必读','GOOD TO KNOW')}</span><h2>{t('还有一点小疑问？','A few things to know.')}<CircleHelp size={25}/></h2><p>{t('关于购买，你可能想了解这些。','A little clarity before you get started.')}</p></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<ChevronDown size={18}/></summary><p>{a}</p></details>)}</div></section>
      <section id="contact" className="contact-section"><div className="contact-copy"><span className="eyebrow">{t('官方售后客服','CUSTOMER SUPPORT')}</span><h2>{t('遇到问题？联系客服','Need help? Contact us')}</h2><p>{t('如遇付款核实、商品交付或账号问题，请附上订单号通过以下方式联系我们：','If you run into any payment, delivery or account issue, reach out with your order ID:')}</p></div><div className="contact-cards"><a className="contact-card" href={`mailto:${supportEmail}`}><span className="contact-label">{t('邮件 / Email','Email')}</span><strong>{supportEmail}</strong></a><div className="contact-card"><span className="contact-label">{t('微信 / WeChat','WeChat')}</span><strong>{supportWechat}</strong></div><a className="contact-card" href={supportTelegramUrl} target="_blank" rel="noopener noreferrer"><span className="contact-label">Telegram</span><strong>{supportTelegram}</strong></a></div></section>
    </main>
  </>;
}
function MusicIcon() { return <span>♫</span>; }
function Root() {
  const {lang,t,setLang}=useLang(); const [config,setConfig]=useState<ShopConfig>(); const [products,setProducts]=useState<Product[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [route,setRoute]=useState(location.hash); const [selected,setSelected]=useState<Product>(); const [receipt,setReceipt]=useState<Receipt>();
  useEffect(()=>{ const change=()=>{setRoute(location.hash); if(['#orders','#admin',''].includes(location.hash)) window.scrollTo({top:0});}; window.addEventListener('hashchange',change); return()=>window.removeEventListener('hashchange',change); },[]);
  async function load(silent = false){if(!silent)setLoading(true);setError('');try {const [c,p]=await Promise.all([api<ShopConfig>('/config'),api<{products:Product[]}>('/products')]);setConfig(c);setProducts(p.products);}catch(e){setError(errorText(e,lang));}finally{if(!silent)setLoading(false);}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{ if (['#catalog','#faq','#how-it-works','#contact'].includes(route)) requestAnimationFrame(()=>document.getElementById(route.slice(1))?.scrollIntoView()); },[route]);
  return <><div className="announcement"><span>✦</span>{t(config?.announcementZh || '把更好的数字生活，放进你的日常。', config?.announcementEn || 'Your everyday, with a little more possibility.')}<span className="announcement-right">{config?.demo?t('演示体验 · 不发生真实扣款','DEMO · NO REAL CHARGES'):t('数字商品 · 订单私密交付','DIGITAL GOODS · PRIVATE DELIVERY')}</span></div><header className="site-header"><div className="container header-inner"><Brand name/><nav aria-label={t('主导航','Main navigation')}><a className={!['#orders','#admin'].includes(route)?'active':''} href="#catalog">{t('探索商品','Discover')}</a><a href="#how-it-works">{t('购买指南','How it works')}</a><a href="#faq">{t('常见问题','FAQs')}</a><a href="#contact">{t('联系客服','Contact')}</a></nav><div className="header-actions"><div className="language-switch" role="group" aria-label={t('切换语言','Switch language')}><Globe2 size={15}/><button type="button" className={lang==='zh'?'active':''} onClick={()=>setLang('zh')}>中文</button><button type="button" className={lang==='en'?'active':''} onClick={()=>setLang('en')}>EN</button></div><span className="header-divider"/><a className={`orders-link ${route==='#orders'?'active':''}`} href="#orders"><ShoppingBag size={18}/><span>{t('我的订单','My orders')}</span></a></div></div></header>
    {route==='#admin'?<Admin onCatalogChange={()=>void load(true)}/>:route==='#orders'?<MyOrders config={config} onOpen={setReceipt}/>:<Shop products={products} config={config} loading={loading} error={error} onBuy={setSelected} reload={()=>void load()}/>}
    <footer className="site-footer"><div className="container footer-main"><div><Brand name/><p>{t('好用的订阅，好一点的每一天。','Good subscriptions. Better little everyday moments.')}</p><div className="footer-contacts"><a href={`mailto:${config?.supportEmail||defaultSupport.email}`}>{t('邮件','Email')}: {config?.supportEmail||defaultSupport.email}</a><span>{t('微信','WeChat')}: {config?.supportWechat||defaultSupport.wechat}</span><a href={(config?.supportTelegram||defaultSupport.telegram).startsWith('http')?(config?.supportTelegram||defaultSupport.telegram):`https://${config?.supportTelegram||defaultSupport.telegram}`} target="_blank" rel="noopener noreferrer">TG: {config?.supportTelegram||defaultSupport.telegram}</a></div></div><div className="footer-links"><a href="#faq">{t('购买与售后','Purchase & support')}</a><a href="#contact">{t('联系店铺','Contact us')}</a><a href="#admin">{t('商家后台','Store admin')}</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} SubNest · {t('订阅集','The digital collection')}</span><span><LockKeyhole size={13}/>{t('私密交付，用心服务','Private deliveries. Thoughtful service.')}</span><span>{t('支付宝 · 微信 · 银行卡 · 币安','Alipay · WeChat · Bank · Binance')}</span></div></footer>
    {selected&&config&&<Checkout product={selected} config={config} onClose={()=>setSelected(undefined)} onOrder={r=>{setSelected(undefined);setReceipt(r);}}/>}
    {receipt&&config&&<OrderDetail receipt={receipt} config={config} onClose={()=>setReceipt(undefined)}/>}
  </>;
}
export default function App(){const [lang,setLangState]=useState<'zh'|'en'>(()=>localStorage.getItem('subnest-lang')==='en'?'en':'zh');const setLang=(next:'zh'|'en')=>{localStorage.setItem('subnest-lang',next);setLangState(next);};useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=lang==='zh'?'订阅集 SubNest · 好用的会员，一站拥有':'SubNest · Your digital collection';},[lang]);return <LanguageContext.Provider value={{lang,setLang,toggle:()=>setLang(lang==='zh'?'en':'zh')}}><Root/></LanguageContext.Provider>;}
