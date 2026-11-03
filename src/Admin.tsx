import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, CreditCard, Database, Download, Eye, EyeOff, KeyRound, LayoutDashboard, LogOut, Package, Plus, RefreshCw, Search, Settings2, ShoppingBag, Sliders, Wallet } from 'lucide-react';
import { api, ApiError, channelNames, money, formatMoney, type Channel, type Order, type Product } from './api';
import { Empty, errorText, Modal, ProductIcon, Spinner, Status, useLang } from './ui';
import SupplierManager, { defaultPaths, maskApiUrl, ToggleSwitch, type Paths } from './SupplierManager';
import { buildSearchIndex, searchAndSortProducts } from './search';

const PRODUCT_PAGE_SIZE = 30;
interface ProdsellerConfig {
  name: string; baseUrl: string; authHeader: string; authPrefix: string; paths: Paths;
  enabled: boolean; markupPercent: number | null; autoEnable: boolean; hasKey: boolean;
  productCount?: number; enabledProductCount?: number; inStockProductCount?: number;
}
interface StoreSettings {
  storeName: string; exchangeRate: number; markupPercent: number;
  supportEmail: string; supportWechat: string; supportTelegram: string;
  announcementZh: string; announcementEn: string;
}
interface Dashboard {
  stats: { total: number; revenueCents: number; pending: number; attention: number };
  mode: string; paymentMode: string; exchangeRate: number; markupPercent: number;
  storeSettings?: StoreSettings; providers: string[]; prodseller?: ProdsellerConfig; channels: Channel[];
}

export default function Admin({ onCatalogChange }: { onCatalogChange: () => void }) {
  const { lang, t } = useLang();
  const [logged, setLogged] = useState<boolean>();
  const [password, setPassword] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productProvider, setProductProvider] = useState('all');
  const [productStock, setProductStock] = useState<'all' | 'in_stock' | 'out_of_stock' | 'local_keys'>('all');
  const [productVisibility, setProductVisibility] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [productPage, setProductPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [supplierKey, setSupplierKey] = useState('');
  const [prodsellerName, setProdsellerName] = useState('ProdSeller');
  const [prodsellerUrl, setProdsellerUrl] = useState('https://prodseller.com/v1');
  const [editingProdseller, setEditingProdseller] = useState(false);
  const [showPrimaryUrl, setShowPrimaryUrl] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState<number>();
  const [editing, setEditing] = useState<Product | 'new'>();
  const [inventory, setInventory] = useState<Product>();
  const [keys, setKeys] = useState('');
  const [activeOrder, setActiveOrder] = useState<Order>();
  const [confirmed, setConfirmed] = useState(false);
  const [delivery, setDelivery] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);

  async function load() {
    try {
      const [d, p, o] = await Promise.all([
        api<Dashboard>('/admin/dashboard'),
        api<{ products: Product[] }>('/admin/products'),
        api<{ orders: Order[]; pages: number }>(`/admin/orders?page=${page}`),
      ]);
      setDashboard(d);
      if (d.prodseller) {
        setProdsellerName(d.prodseller.name || 'ProdSeller');
        setProdsellerUrl(d.prodseller.baseUrl || 'https://prodseller.com/v1');
      }
      setProducts(p.products);
      setOrders(o.orders);
      setPages(o.pages);
      setLogged(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLogged(false);
      else setError(errorText(e, lang));
    }
  }
  async function loadOrders(targetPage = page) {
    try {
      const o = await api<{ orders: Order[]; pages: number }>(`/admin/orders?page=${targetPage}`);
      setOrders(o.orders);
      setPages(o.pages);
    } catch (e) {
      setError(errorText(e, lang));
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (logged) void loadOrders(page); }, [page]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); if (success) setMessage(success); await load(); onCatalogChange(); }
    catch (e) { setError(errorText(e, lang)); }
    finally { setBusy(false); }
  }
  async function toggleSingleProduct(p: Product, nextEnabled: boolean) {
    setError('');
    setProducts(prev => prev.map(item => item.id === p.id ? { ...item, enabled: nextEnabled } : item));
    try {
      await api(`/admin/products/${p.id}/toggle`, { method: 'PATCH', body: { enabled: nextEnabled } });
      onCatalogChange();
    } catch (e) {
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, enabled: !nextEnabled } : item));
      setError(errorText(e, lang));
    }
  }
  async function batchToggleProducts(ids: string[], action: 'enable' | 'disable', label: string) {
    if (!ids.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await api<{ count: number }>('/admin/products/batch', { method: 'POST', body: { action, ids } });
      const idSet = new Set(ids);
      const nextEnabled = action === 'enable';
      setProducts(prev => prev.map(item => idSet.has(item.id) ? { ...item, enabled: nextEnabled } : item));
      setSelectedIds(new Set());
      setMessage(`${label}（${res.count} 件）`);
      onCatalogChange();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    await run(async () => { await api('/admin/login', { method: 'POST', body: { password } }); setPassword(''); });
  }
  const tabs = [
    { id: 'overview', icon: LayoutDashboard, zh: '经营概览', en: 'Overview' },
    { id: 'orders', icon: ShoppingBag, zh: '订单管理', en: 'Orders' },
    { id: 'products', icon: Package, zh: '商品与库存', en: 'Products' },
    { id: 'integration', icon: Settings2, zh: '供货商管理', en: 'Suppliers' },
    { id: 'payments', icon: CreditCard, zh: '收款设置', en: 'Payments' },
    { id: 'settings', icon: Sliders, zh: '自定义设置', en: 'Settings' },
  ];

  const indexedProducts = useMemo(() => buildSearchIndex(products), [products]);

  const productProviders = useMemo(() => (
    [...new Map(products.map(p => [p.provider ?? '', p.provider === 'local' ? t('自营商品', 'Own products') : (p.providerName || p.provider || '')])).entries()].filter(([id]) => id)
  ), [products, lang]);

  const baseFilteredProducts = useMemo(
    () => searchAndSortProducts(indexedProducts, {
      query: productSearch,
      category: productCategory,
      provider: productProvider,
      ignoreCategoryWhenSearching: false,
    }),
    [indexedProducts, productCategory, productProvider, productSearch]
  );

  const { inStockCount, outOfStockCount, enabledCount, disabledCount } = useMemo(() => {
    let inStock = 0;
    let enabled = 0;
    for (const p of baseFilteredProducts) {
      if (p.inStock) inStock++;
      if (p.enabled) enabled++;
    }
    return {
      inStockCount: inStock,
      outOfStockCount: baseFilteredProducts.length - inStock,
      enabledCount: enabled,
      disabledCount: baseFilteredProducts.length - enabled,
    };
  }, [baseFilteredProducts]);

  const visibleProducts = useMemo(() => (
    baseFilteredProducts.filter(p => {
      const stockMatch = productStock === 'all' || (productStock === 'in_stock' && p.inStock) || (productStock === 'out_of_stock' && !p.inStock) || (productStock === 'local_keys' && p.stock !== null);
      const visMatch = productVisibility === 'all' || (productVisibility === 'enabled' && !!p.enabled) || (productVisibility === 'disabled' && !p.enabled);
      return stockMatch && visMatch;
    }).sort((a, b) => Number(b.inStock) - Number(a.inStock))
  ), [baseFilteredProducts, productStock, productVisibility]);

  useEffect(() => {
    setProductPage(1);
    setSelectedIds(new Set());
  }, [productSearch, productCategory, productProvider, productStock, productVisibility]);

  const productPages = Math.max(1, Math.ceil(visibleProducts.length / PRODUCT_PAGE_SIZE));
  const pagedProducts = useMemo(
    () => visibleProducts.slice((productPage - 1) * PRODUCT_PAGE_SIZE, productPage * PRODUCT_PAGE_SIZE),
    [visibleProducts, productPage]
  );

  const allPageSelected = pagedProducts.length > 0 && pagedProducts.every(p => selectedIds.has(p.id));
  function toggleSelectPage() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const p of pagedProducts) next.delete(p.id);
      } else {
        for (const p of pagedProducts) next.add(p.id);
      }
      return next;
    });
  }
  function toggleSelectOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasActiveFilters = Boolean(productSearch.trim()) || productCategory !== 'all' || productProvider !== 'all' || productStock !== 'all' || productVisibility !== 'all';
  if (logged === undefined) return <div className="loading"><Spinner />{error}</div>;
  if (!logged) return (
    <main className="container login-page">
      <div className="login-card">
        <span className="login-icon"><KeyRound size={28} /></span>
        <span className="eyebrow">{t('商家管理后台', 'SUBNEST MERCHANT')}</span>
        <h1>{t('欢迎回到你的店铺', 'Welcome to your store')}</h1>
        <p>{t('登录后管理商品、供货商开关、核实收款与自定义设置。', 'Manage your collection, suppliers, payments and settings.')}</p>
        <form onSubmit={login} className="form-stack">
          <label>{t('管理员密码', 'Admin password')}<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary full" disabled={busy}>{busy && <Spinner />}{t('进入管理后台', 'Sign in')}</button>
        </form>
        <p className="field-hint">{t('密码由服务器配置中的 ADMIN_PASSWORD 设置。', 'Use the ADMIN_PASSWORD configured on your server.')}</p>
      </div>
    </main>
  );
  const rate = dashboard?.exchangeRate || 7.2;
  function orderTable(list: Order[]) {
    return list.length ? (
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('商品 / 订单', 'Product / order')}</th><th>{t('金额', 'Amount')}</th><th>{t('付款渠道', 'Payment')}</th><th>{t('状态', 'Status')}</th><th>{t('操作', 'Action')}</th></tr></thead>
          <tbody>
            {list.map(o => (
              <tr key={o.id}>
                <td><strong>{o.productName} × {o.quantity}</strong><small>{o.id.slice(0, 8)} · {new Date(o.createdAt).toLocaleDateString()}</small></td>
                <td>{formatMoney(o.totalCents, lang, rate)}{o.demo && <small>{t('演示', 'Demo')}</small>}</td>
                <td>{t(...channelNames[o.paymentChannel])}</td>
                <td><Status status={o.status} /></td>
                <td><button className="text-button" onClick={() => { setActiveOrder(o); setConfirmed(false); setDelivery(''); setRecoveryId(''); setRecoveryConfirmed(false); }}>{t('查看处理', 'Manage')}<ArrowRight size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : <Empty title={t('暂无订单', 'No orders yet')} text={t('客户创建订单后会出现在这里。', 'Customer orders will appear here.')} />;
  }

  return (
    <main className="container admin-page">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">{t('店铺全局概览', 'YOUR STORE, AT A GLANCE')}</span>
          <h1>{t('店铺管理后台', 'Store Admin')}</h1>
        </div>
        <div className="row">
          <span className="mode-tag">{dashboard?.paymentMode === 'demo' ? t('演示模式', 'Demo mode') : t('正式营业', 'Live mode')}</span>
          <button className="button secondary small" disabled={busy} onClick={() => run(async () => { await api('/admin/logout', { method: 'POST', body: {} }); setLogged(false); })}>
            <LogOut size={15} />{t('退出', 'Sign out')}
          </button>
        </div>
      </div>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          {tabs.map(item => (
            <button type="button" className={tab === item.id ? 'active' : ''} key={item.id} onClick={() => { setTab(item.id); setError(''); setMessage(''); }}>
              <item.icon size={18} />{t(item.zh, item.en)}
            </button>
          ))}
          <div className="sidebar-note"><ShieldLabel /><p>{t('每一份订阅，都认真交付。', 'A little care in every delivery.')}</p></div>
        </aside>
        <section className="admin-content">
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success-banner" role="status"><Check size={16} />{message}</div>}

          {tab === 'overview' && (
            <>
              <div className="stats-grid">
                {[
                  [t('订单总数', 'Total orders'), dashboard?.stats.total ?? 0],
                  [t('已确认收款', 'Confirmed revenue'), formatMoney(dashboard?.stats.revenueCents ?? 0, lang, rate)],
                  [t('待核实付款', 'Payments to review'), dashboard?.stats.pending ?? 0],
                  [t('在售 / 总商品', 'Published / Total'), `${products.filter(p => p.enabled).length} / ${products.length}`],
                ].map(([label, value]) => <div className="stat-card" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
              </div>
              <div className="admin-panel">
                <div className="panel-heading"><h2>{t('最近订单', 'Recent orders')}</h2><button className="text-button" onClick={() => setTab('orders')}>{t('查看全部', 'View all')}<ArrowRight size={15} /></button></div>
                {orderTable(orders.slice(0, 6))}
              </div>
              <div className="admin-callout">
                <Database size={28} />
                <div>
                  <h3>{t('快捷管理供货商与商品批量上下架', 'Suppliers, batch publishing & custom settings')}</h3>
                  <p>{t('可一键开关任意供货商、批量上下架筛选商品，或在自定义设置中调整汇率、加价比例、公告与联系方式。', 'Toggle suppliers on/off, batch publish/hide products, or customize exchange rates, markups and contact info.')}</p>
                </div>
                <div className="row">
                  <button className="button secondary small" onClick={() => setTab('integration')}>{t('供货商开关', 'Suppliers')}</button>
                  <button className="button secondary small" onClick={() => setTab('products')}>{t('批量管理商品', 'Products')}</button>
                  <button className="button primary small" onClick={() => setTab('settings')}>{t('自定义设置', 'Settings')}</button>
                </div>
              </div>
            </>
          )}

          {tab === 'orders' && (
            <div className="admin-panel">
              <div className="panel-heading"><h2>{t('订单管理', 'Orders')}</h2><button className="button secondary small" onClick={() => void loadOrders(page)}><RefreshCw size={14} />{t('刷新', 'Refresh')}</button></div>
              {orderTable(orders)}
              <div className="pagination">
                <button className="icon-button" aria-label={t('上一页', 'Previous page')} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ArrowLeft size={18} /></button>
                <span>{page} / {Math.max(1, pages)}</span>
                <button className="icon-button" aria-label={t('下一页', 'Next page')} disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ArrowRight size={18} /></button>
              </div>
            </div>
          )}

          {tab === 'products' && (
            <div className="admin-panel">
              <div className="panel-heading">
                <h2>{t('商品与库存', 'Products & inventory')}</h2>
                <div className="row">
                  <button className="button secondary small" disabled={busy} onClick={() => run(() => api('/admin/sync', { method: 'POST', body: { provider: productProvider !== 'all' && productProvider !== 'local' ? productProvider : 'prodseller' } }), t('商品已同步', 'Products synced'))}><RefreshCw size={14} />{t('同步商品', 'Sync')}</button>
                  <button className="button primary small" onClick={() => setEditing('new')}><Plus size={15} />{t('添加自营商品', 'Add product')}</button>
                </div>
              </div>
              <div className="admin-product-filters">
                <label className="admin-product-search">
                  <Search size={16} />
                  <input aria-label={t('搜索后台商品', 'Search admin products')} placeholder={t('搜索商品、品牌别名（如 剪映 / 油管）或供货商…', 'Search products, brand aliases or suppliers…')} value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  {productSearch && <button type="button" className="search-clear" onClick={() => setProductSearch('')}>×</button>}
                </label>
                <select aria-label={t('后台商品分类', 'Admin product category')} value={productCategory} onChange={e => setProductCategory(e.target.value)}>
                  <option value="all">{t('全部分类', 'All categories')}</option>
                  <option value="services">{t('账号与验证', 'Account services')}</option>
                  <option value="ai">{t('AI 工具', 'AI tools')}</option>
                  <option value="streaming">{t('影音娱乐', 'Entertainment')}</option>
                  <option value="design">{t('创意设计', 'Creative')}</option>
                  <option value="tools">{t('效率办公', 'Productivity')}</option>
                  <option value="gaming">{t('游戏服务', 'Gaming')}</option>
                </select>
                <select aria-label={t('后台供货商筛选', 'Filter by supplier')} value={productProvider} onChange={e => setProductProvider(e.target.value)}>
                  <option value="all">{t('全部供货商', 'All suppliers')}</option>
                  {productProviders.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select aria-label={t('后台库存筛选', 'Filter by stock')} value={productStock} onChange={e => setProductStock(e.target.value as typeof productStock)}>
                  <option value="all">{t('全部库存', 'All stock')}</option>
                  <option value="in_stock">{t('有货 / 可购买', 'In stock')}</option>
                  <option value="out_of_stock">{t('缺货 / 售罄', 'Out of stock')}</option>
                  <option value="local_keys">{t('自营卡密库存', 'Own key inventory')}</option>
                </select>
                <select aria-label={t('后台上架筛选', 'Filter by status')} value={productVisibility} onChange={e => setProductVisibility(e.target.value as typeof productVisibility)}>
                  <option value="all">{t('全部状态', 'All statuses')}</option>
                  <option value="enabled">{t('已上架', 'Published')}</option>
                  <option value="disabled">{t('已下架', 'Hidden')}</option>
                </select>
                <span>{t(`显示 ${visibleProducts.length} / ${products.length} 件`, `${visibleProducts.length} / ${products.length} items`)}</span>
              </div>
              <div className="admin-stock-pills">
                <button type="button" className={`stock-pill ${productStock === 'all' && productVisibility === 'all' ? 'active' : ''}`} onClick={() => { setProductStock('all'); setProductVisibility('all'); }}>{t(`全部 (${baseFilteredProducts.length})`, `All (${baseFilteredProducts.length})`)}</button>
                <button type="button" className={`stock-pill ${productStock === 'in_stock' ? 'active' : ''}`} onClick={() => setProductStock(s => s === 'in_stock' ? 'all' : 'in_stock')}>{t(`有货 (${inStockCount})`, `In stock (${inStockCount})`)}</button>
                <button type="button" className={`stock-pill ${productStock === 'out_of_stock' ? 'active' : ''}`} onClick={() => setProductStock(s => s === 'out_of_stock' ? 'all' : 'out_of_stock')}>{t(`缺货 (${outOfStockCount})`, `Out of stock (${outOfStockCount})`)}</button>
                <button type="button" className={`stock-pill ${productVisibility === 'enabled' ? 'active' : ''}`} onClick={() => setProductVisibility(v => v === 'enabled' ? 'all' : 'enabled')}>{t(`已上架 (${enabledCount})`, `Published (${enabledCount})`)}</button>
                <button type="button" className={`stock-pill ${productVisibility === 'disabled' ? 'active' : ''}`} onClick={() => setProductVisibility(v => v === 'disabled' ? 'all' : 'disabled')}>{t(`已下架 (${disabledCount})`, `Hidden (${disabledCount})`)}</button>
                {hasActiveFilters && <button type="button" className="text-button" onClick={() => { setProductSearch(''); setProductCategory('all'); setProductProvider('all'); setProductStock('all'); setProductVisibility('all'); }}>{t('重置筛选', 'Reset filters')}</button>}
              </div>

              <div className="admin-batch-bar">
                {selectedIds.size > 0 ? (
                  <>
                    <span className="batch-info">{t(`已勾选 ${selectedIds.size} 件商品`, `${selectedIds.size} selected`)}</span>
                    {selectedIds.size < visibleProducts.length && (
                      <button type="button" className="text-button" onClick={() => setSelectedIds(new Set(visibleProducts.map(p => p.id)))}>
                        {t(`全选当前筛选的全部 ${visibleProducts.length} 件`, `Select all ${visibleProducts.length} filtered`)}
                      </button>
                    )}
                    <button type="button" className="text-button" onClick={() => setSelectedIds(new Set())}>{t('取消勾选', 'Clear selection')}</button>
                    <div className="batch-actions">
                      <button type="button" className="button primary small" disabled={busy} onClick={() => void batchToggleProducts([...selectedIds], 'enable', t('已批量上架选中商品', 'Selected products published'))}>
                        <Eye size={14} />{t(`批量上架选中 (${selectedIds.size})`, `Publish selected (${selectedIds.size})`)}
                      </button>
                      <button type="button" className="button secondary small" disabled={busy} onClick={() => void batchToggleProducts([...selectedIds], 'disable', t('已批量下架选中商品', 'Selected products hidden'))}>
                        <EyeOff size={14} />{t(`批量下架选中 (${selectedIds.size})`, `Hide selected (${selectedIds.size})`)}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="batch-info">{t('可勾选商品批量操作，或直接对当前筛选结果一键批量上下架：', 'Select rows or batch update all currently filtered items:')}</span>
                    <div className="batch-actions">
                      <button type="button" className="button secondary small" disabled={busy || !visibleProducts.length} onClick={() => void batchToggleProducts(visibleProducts.map(p => p.id), 'enable', t('已批量上架当前筛选商品', 'Filtered products published'))}>
                        <Eye size={14} />{t(`批量上架当前筛选 (${visibleProducts.length})`, `Publish filtered (${visibleProducts.length})`)}
                      </button>
                      <button type="button" className="button secondary small" disabled={busy || !visibleProducts.length} onClick={() => void batchToggleProducts(visibleProducts.map(p => p.id), 'disable', t('已批量下架当前筛选商品', 'Filtered products hidden'))}>
                        <EyeOff size={14} />{t(`批量下架当前筛选 (${visibleProducts.length})`, `Hide filtered (${visibleProducts.length})`)}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="check-col">
                        <input type="checkbox" aria-label={t('全选本页商品', 'Select page')} checked={allPageSelected} onChange={toggleSelectPage} />
                      </th>
                      <th>{t('商品', 'Product')}</th>
                      <th>{t('售价 / 供货商', 'Price / Supplier')}</th>
                      <th>{t('库存', 'Stock')}</th>
                      <th>{t('上架开关', 'Publish')}</th>
                      <th>{t('操作', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map(p => (
                      <tr key={p.id} className={selectedIds.has(p.id) ? 'row-selected' : ''}>
                        <td className="check-col">
                          <input type="checkbox" aria-label={p.name} checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} />
                        </td>
                        <td>
                          <div className="table-product">
                            <ProductIcon brand={p.brand} name={`${p.name} ${p.nameEn}`} small />
                            <div>
                              <strong>{lang === 'en' && p.nameEn ? p.nameEn : p.name}</strong>
                              <small>{lang === 'en' ? p.name : p.nameEn}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {formatMoney(p.priceCents, lang, rate)}
                          <small>
                            {p.provider === 'local' ? t('自营商品', 'Own product') : (p.providerName || p.provider)}
                            {p.costUsdt ? ` · ${t('成本', 'Cost')} $${Number(p.costUsdt).toFixed(2)}` : ''}
                          </small>
                        </td>
                        <td>
                          <span className={`stock-badge ${p.inStock ? 'in' : 'out'}`}>
                            {p.stock !== null ? p.stock : p.inStock ? t('可购买', 'Available') : t('缺货', 'Sold out')}
                          </span>
                        </td>
                        <td>
                          <ToggleSwitch
                            checked={!!p.enabled}
                            label={t(`切换 ${p.name} 上下架`, `Toggle ${p.name}`)}
                            activeText={t('已上架', 'On')}
                            inactiveText={t('已下架', 'Off')}
                            onChange={next => void toggleSingleProduct(p, next)}
                          />
                        </td>
                        <td>
                          <div className="row">
                            <button type="button" className="text-button" onClick={() => setEditing(p)}>{t('编辑', 'Edit')}</button>
                            {p.provider === 'local' && p.delivery === 'instant' && (
                              <button type="button" className="text-button" onClick={() => { setInventory(p); setKeys(''); }}>{t('导入卡密', 'Add keys')}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {productPages > 1 && (
                <div className="pagination">
                  <button type="button" className="icon-button" aria-label={t('上一页', 'Previous page')} disabled={productPage <= 1} onClick={() => setProductPage(p => Math.max(1, p - 1))}><ArrowLeft size={18} /></button>
                  <span>{t(`第 ${productPage} / ${productPages} 页（每页 ${PRODUCT_PAGE_SIZE} 件）`, `Page ${productPage} / ${productPages} (${PRODUCT_PAGE_SIZE} per page)`)}</span>
                  <button type="button" className="icon-button" aria-label={t('下一页', 'Next page')} disabled={productPage >= productPages} onClick={() => setProductPage(p => Math.min(productPages, p + 1))}><ArrowRight size={18} /></button>
                </div>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{t('收款设置', 'Payment settings')}</h2>
                  <p className="muted">{t('填写实际收款信息后启用。所有转账由你核对到账，再确认发货；支付宝已支持官方网关自动核款。', 'Enable each method after entering your receiving details.')}</p>
                </div>
              </div>
              <div className="payment-settings">
                {dashboard?.channels.map(c => (
                  <ChannelForm key={c.id} channel={c} busy={busy} onSave={data => run(() => api(`/admin/channels/${c.id}`, { method: 'PUT', body: data }), t('收款设置已保存', 'Payment settings saved'))} />
                ))}
              </div>
              <p className="notice">{t('使用币安转账时，请在收款说明中写明币安 UID / 收款地址、币种、网络及折算人民币规则。系统不会自动确认链上或币安到账。', 'For Binance transfers, specify the receiving UID/address, currency, network and CNY conversion instructions. Deposits are verified manually.')}</p>
            </>
          )}

          {tab === 'integration' && (
            <>
              <div className={`admin-panel integration-panel ${dashboard?.prodseller?.enabled === false ? 'supplier-disabled' : ''}`}>
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">{t('主供货商接口', 'PRIMARY SUPPLIER')}</span>
                    <h2>{dashboard?.prodseller?.name || 'ProdSeller API'}</h2>
                  </div>
                  <div className="row">
                    <span className="mode-tag">{dashboard?.mode === 'demo' ? t('演示适配器', 'Demo adapter') : t('真实接口', 'Live API')}</span>
                    <ToggleSwitch
                      checked={dashboard?.prodseller?.enabled !== false}
                      disabled={busy}
                      label={t('切换主供货商启用状态', 'Toggle primary supplier')}
                      activeText={t('供货商已启用', 'Enabled')}
                      inactiveText={t('供货商已停用', 'Disabled')}
                      onChange={next => void run(
                        () => api('/admin/providers/prodseller/toggle', { method: 'PATCH', body: { enabled: next } }),
                        next ? t('主供货商已启用，商品已恢复前台展示', 'Primary supplier enabled') : t('主供货商已停用，其商品已从前台隐藏', 'Primary supplier disabled'),
                      )}
                    />
                  </div>
                </div>
                <p>{t('商品、余额、采购和交付查询均通过服务器连接。支持一键开关供货商、配置独立加价比例、修改 API 地址与加密密钥。', 'Products, balance, purchases and fulfillment are handled on the server. Toggle the supplier or customize its URL, markup and encrypted key anytime.')}</p>
                <div className="supplier-stats-row">
                  <span>{t('商品总数', 'Products')}: <strong>{dashboard?.prodseller?.productCount ?? 0}</strong></span>
                  <span>{t('已上架', 'Published')}: <strong>{dashboard?.prodseller?.enabledProductCount ?? 0}</strong></span>
                  <span>{t('有货', 'In stock')}: <strong>{dashboard?.prodseller?.inStockProductCount ?? 0}</strong></span>
                </div>
                <dl>
                  <div><dt>{t('供货商名称', 'Supplier name')}</dt><dd>{dashboard?.prodseller?.name || 'ProdSeller'}</dd></div>
                  <div><dt>{t('API 地址', 'API base')}</dt><dd>{showPrimaryUrl ? (dashboard?.prodseller?.baseUrl || 'https://prodseller.com/v1') : maskApiUrl(dashboard?.prodseller?.baseUrl || 'https://prodseller.com/v1')} <button type="button" className="text-button" onClick={() => setShowPrimaryUrl(v => !v)}>{showPrimaryUrl ? <EyeOff size={13} /> : <Eye size={13} />}{showPrimaryUrl ? t('隐藏', 'Hide') : t('显示', 'Show')}</button></dd></div>
                  <div><dt>{t('成本换算与加价', 'Cost & markup')}</dt><dd>1 USDT → {dashboard?.exchangeRate} CNY ({t('加价', 'Markup')} {dashboard?.prodseller?.markupPercent ?? dashboard?.markupPercent}%)</dd></div>
                  <div><dt>{t('供应商余额', 'Supplier balance')}</dt><dd>{balance === undefined ? '—' : `${balance.toFixed(2)} USDT`}</dd></div>
                </dl>
                <div className="row">
                  <button className="button secondary" disabled={busy} onClick={() => setEditingProdseller(true)}><Settings2 size={16} />{t('编辑与自定义', 'Edit & customize')}</button>
                  <button className="button primary" disabled={busy} onClick={() => run(() => api('/admin/sync', { method: 'POST', body: {} }), t('商品已同步', 'Products synced'))}><RefreshCw size={16} />{t('同步商品', 'Sync catalog')}</button>
                  <button className="button secondary" disabled={busy} onClick={() => run(async () => { setBalance((await api<{ balance: number }>('/admin/balance')).balance); })}><Wallet size={16} />{t('查询余额', 'Check balance')}</button>
                  <button className="button secondary small" disabled={busy || !(dashboard?.prodseller?.productCount ?? 0)} onClick={() => run(() => api('/admin/products/batch', { method: 'POST', body: { action: 'enable', provider: 'prodseller' } }), t('已将主供货商全部商品设为上架', 'All primary supplier products published'))}><Eye size={15} />{t('全部上架', 'Publish all')}</button>
                  <button className="button secondary small" disabled={busy || !(dashboard?.prodseller?.productCount ?? 0)} onClick={() => run(() => api('/admin/products/batch', { method: 'POST', body: { action: 'disable', provider: 'prodseller' } }), t('已将主供货商全部商品设为下架', 'All primary supplier products hidden'))}><EyeOff size={15} />{t('全部下架', 'Hide all')}</button>
                </div>
                <div className="notice">
                  <strong>{t('连接或编辑供货商', 'Connect or edit supplier')}</strong>
                  <p>{t('可直接修改下方供货商名称、API 连接地址和密钥，或点击“编辑与自定义”配置请求头、接口路径及独立加价比例。', 'Update the supplier name, API base URL and key below, or click Edit & customize for headers, paths and custom markup.')}</p>
                </div>
                <form className="form-stack supplier-form" onSubmit={e => {
                  e.preventDefault();
                  void run(async () => {
                    await api('/admin/providers/prodseller', { method: 'POST', body: { name: prodsellerName, baseUrl: prodsellerUrl, apiKey: supplierKey } });
                    setSupplierKey('');
                    setBalance(undefined);
                  }, t('供应商已连接，商品已同步。', 'Supplier connected and catalog synced.'));
                }}>
                  <div className="form-columns">
                    <label>{t('供货商名称', 'Supplier name')}<input required maxLength={80} value={prodsellerName} onChange={e => setProdsellerName(e.target.value)} /></label>
                    <label>{t('API 连接地址（加密存储）', 'API base URL (encrypted)')}<input type={showPrimaryUrl ? "url" : "password"} required maxLength={500} autoComplete="off" spellCheck={false} value={prodsellerUrl} onChange={e => setProdsellerUrl(e.target.value)} /></label>
                  </div>
                  <label>{t('API Key（AES-256-GCM 加密锁定，不可查看）', 'API key (AES-256-GCM encrypted, write-only)')}<input type="password" required={dashboard?.mode === 'demo'} minLength={supplierKey ? 8 : undefined} maxLength={256} autoComplete="new-password" spellCheck={false} value={supplierKey} onChange={e => setSupplierKey(e.target.value)} placeholder={dashboard?.prodseller?.hasKey ? t('AES-256-GCM 已加密锁定，留空保持不变', 'AES-256-GCM encrypted; leave blank to keep it') : 'psk_••••••••••••••••'} /></label>
                  <button className="button primary" disabled={busy || (dashboard?.mode === 'demo' && !supplierKey)}>{busy ? <Spinner /> : <KeyRound size={16} />} {dashboard?.mode === 'demo' ? t('验证并连接', 'Verify and connect') : supplierKey ? t('更新并验证密钥', 'Update and verify key') : t('保存供货商设置', 'Save supplier settings')}</button>
                </form>
                <p className="muted">{t('可以在下方继续添加、开关或自定义其他供货商。', 'Add, toggle or customize more suppliers below.')}</p>
              </div>
              <SupplierManager onCatalogChange={() => { void load(); onCatalogChange(); }} />
            </>
          )}

          {tab === 'settings' && (
            <StoreSettingsForm
              settings={dashboard?.storeSettings ?? {
                storeName: 'SubNest 订阅集',
                exchangeRate: dashboard?.exchangeRate ?? 7.2,
                markupPercent: dashboard?.markupPercent ?? 35,
                supportEmail: 'support@example.com',
                supportWechat: 'support_wechat',
                supportTelegram: 't.me/support_contact',
                announcementZh: '把更好的数字生活，放进你的日常。',
                announcementEn: 'Your everyday, with a little more possibility.',
              }}
              busy={busy}
              onSave={data => void run(
                () => api('/admin/settings', { method: 'PUT', body: data }),
                t('店铺自定义设置已保存并生效', 'Store settings saved and applied'),
              )}
            />
          )}
        </section>
      </div>

      {editingProdseller && (
        <ProdsellerModal
          config={dashboard?.prodseller}
          mode={dashboard?.mode ?? 'demo'}
          busy={busy}
          error={error}
          onClose={() => setEditingProdseller(false)}
          onSave={data => run(async () => {
            await api('/admin/providers/prodseller', { method: 'POST', body: data });
            setEditingProdseller(false);
            setSupplierKey('');
            setBalance(undefined);
          }, t('供货商设置已保存', 'Supplier settings saved'))}
        />
      )}
      {editing && (
        <ProductForm
          error={error}
          product={editing}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={data => run(async () => {
            if (editing === 'new') await api('/admin/products', { method: 'POST', body: data });
            else await api(`/admin/products/${editing.id}`, { method: 'PATCH', body: data });
            setEditing(undefined);
          }, t('商品已保存', 'Product saved'))}
        />
      )}
      {inventory && (
        <Modal title={`${t('导入卡密库存 · ', 'Import keys · ')}${inventory.name}`} onClose={() => setInventory(undefined)}>
          {error && <p className="error" role="alert">{error}</p>}
          <form className="form-stack" onSubmit={e => {
            e.preventDefault();
            void run(async () => {
              await api(`/admin/products/${inventory.id}/inventory`, { method: 'POST', body: { keys: keys.split(/\r?\n/).map(k => k.trim()).filter(Boolean) } });
              setInventory(undefined);
            }, t('库存已导入', 'Inventory imported'));
          }}>
            <p className="muted">{t('每行一条卡密或兑换码，将在服务器上加密保存，重复内容自动跳过。', 'Enter one license key or code per line. Keys are encrypted at rest and duplicates are skipped.')}</p>
            <textarea rows={7} required value={keys} onChange={e => setKeys(e.target.value)} placeholder="license-key-001\nlicense-key-002" />
            <button className="button primary" disabled={busy}>{busy ? <Spinner /> : <Download size={16} />} {t('导入库存', 'Import inventory')}</button>
          </form>
        </Modal>
      )}
      {activeOrder && (
        <Modal title={t('处理订单', 'Manage order')} onClose={() => setActiveOrder(undefined)}>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="order-heading"><h3>{activeOrder.productName} × {activeOrder.quantity}</h3><Status status={activeOrder.status} /></div>
          <div className="order-meta">
            <span>{t('应收金额', 'Expected amount')}<strong>{formatMoney(activeOrder.totalCents, lang, rate)} {t('CNY', 'USD')}</strong></span>
            <span>{t('收款渠道', 'Method')}<strong>{t(...channelNames[activeOrder.paymentChannel])}</strong></span>
            <span>{t('联系邮箱', 'Contact email')}<strong>{activeOrder.email}</strong></span>
            <span>{t('开通邮箱', 'Activation emails')}<strong>{activeOrder.activationEmails.join(', ') || '—'}</strong></span>
            {activeOrder.serviceAccount && <span>{t('任务账号', 'Task account')}<strong>{activeOrder.serviceAccount}</strong></span>}
            <span>{t('转账参考号', 'Payment reference')}<strong>{activeOrder.paymentReference || '—'}</strong></span>
            <span>{t('订单号', 'Order ID')}<code>{activeOrder.id}</code></span>
          </div>
          {activeOrder.demo && <div className="notice">{t('这是演示订单，没有真实付款。', 'Demo order. No actual payment was made.')}</div>}
          {activeOrder.lastError && <p className="error">{activeOrder.lastError}</p>}
          {activeOrder.paymentStatus !== 'paid' && (
            <div className="form-stack">
              <p className="notice">{t('请在实际收款账户核对金额和交易号。客户提交参考号不代表已到账。确认后会立即安排采购或发货。', 'Verify the amount and reference in your receiving account. A submitted reference does not prove payment. Confirmation initiates procurement or delivery.')}</p>
              <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('我已核实这笔付款确实到账', 'I have verified receipt of this payment')}</label>
              <button className="button primary" disabled={busy || !confirmed} onClick={() => run(async () => { await api(`/admin/orders/${activeOrder.id}/confirm`, { method: 'POST', body: { confirmed: true } }); setActiveOrder(undefined); }, t('付款已确认，已安排交付', 'Payment confirmed; fulfillment started'))}>{busy && <Spinner />}{t('确认到账并交付', 'Confirm payment & fulfill')}</button>
            </div>
          )}
          {activeOrder.status === 'needs_attention' && !activeOrder.canReconcile && (
            <button className="button primary" disabled={busy} onClick={() => run(async () => { await api(`/admin/orders/${activeOrder.id}/retry`, { method: 'POST', body: {} }); setActiveOrder(undefined); }, t('已执行重试，请查看最新状态', 'Retry complete. Review the updated status.'))}><RefreshCw size={16} />{t('重试交付（保留原采购编号）', 'Retry with original purchase reference')}</button>
          )}
          {activeOrder.canReconcile && (
            <form className="form-stack" onSubmit={e => { e.preventDefault(); void run(async () => { await api(`/admin/orders/${activeOrder.id}/reconcile`, { method: 'POST', body: { supplierOrderId: recoveryId, confirmed: true } }); setActiveOrder(undefined); }, t('已核对并恢复交付', 'Supplier delivery recovered')); }}>
              <p className="notice">{t('供货商未提供安全重试。请到其后台查找这次采购，核对时间、商品和收件人无误后，输入供货商订单号恢复交付；切勿盲目重新下单。', 'This supplier does not support safe retries. Find the purchase in the supplier dashboard, verify the product and recipient, then enter the supplier order ID.')}</p>
              <label>{t('供货商订单号 / 采购编号', 'Supplier order / purchase ID')}<input required maxLength={200} value={recoveryId} onChange={e => setRecoveryId(e.target.value)} placeholder="ord_..." /></label>
              <label className="check-label"><input type="checkbox" checked={recoveryConfirmed} onChange={e => setRecoveryConfirmed(e.target.checked)} />{t('我已在供货商后台核对该订单属于此客户', 'I verified in the supplier dashboard that this order belongs to this customer')}</label>
              <button className="button primary" disabled={busy || !recoveryConfirmed || !recoveryId.trim()}>{busy && <Spinner />}{t('核对并取回交付内容', 'Verify & recover delivery')}</button>
            </form>
          )}
          {activeOrder.paymentStatus === 'paid' && activeOrder.provider === 'local' && activeOrder.status !== 'delivered' && (
            <form className="form-stack" onSubmit={e => { e.preventDefault(); void run(async () => { await api(`/admin/orders/${activeOrder.id}/deliver`, { method: 'POST', body: { text: delivery } }); setActiveOrder(undefined); }, t('交付内容已发送到订单页', 'Delivery is available on the customer order page')); }}>
              <label>{t('交付内容 / 开通说明', 'Delivery content / activation details')}<textarea required rows={5} value={delivery} onChange={e => setDelivery(e.target.value)} /></label>
              <button className="button primary" disabled={busy}>{t('完成交付', 'Complete delivery')}</button>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}

function ShieldLabel() { return <KeyRound size={22} />; }

function StoreSettingsForm({ settings, busy, onSave }: { settings: StoreSettings; busy: boolean; onSave: (data: unknown) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState(settings);
  const [recalculatePrices, setRecalculatePrices] = useState(true);
  const [clearPriceOverrides, setClearPriceOverrides] = useState(false);

  useEffect(() => { setForm(settings); }, [settings.exchangeRate, settings.markupPercent, settings.storeName, settings.supportEmail, settings.supportWechat, settings.supportTelegram, settings.announcementZh, settings.announcementEn]);

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="admin-panel integration-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t('全局自定义配置', 'STORE CUSTOMIZATION')}</span>
          <h2>{t('自定义设置', 'Custom store settings')}</h2>
          <p className="muted">{t('配置全局汇率、默认加价比例、顶部双语公告栏与客服联系方式，保存后前台实时生效。', 'Customize exchange rate, default markup, bilingual announcement bar and customer support contacts.')}</p>
        </div>
      </div>
      <form className="form-stack" onSubmit={e => {
        e.preventDefault();
        onSave({
          ...form,
          exchangeRate: Number(form.exchangeRate),
          markupPercent: Number(form.markupPercent),
          recalculatePrices,
          clearPriceOverrides,
        });
      }}>
        <h3>{t('1. 汇率与全局定价规则', '1. Exchange rate & pricing')}</h3>
        <div className="form-columns">
          <label>
            {t('全局汇率（1 USD/USDT 兑人民币）', 'Exchange rate (1 USD/USDT to CNY)')}
            <input required type="number" min="0.01" max="1000" step="0.01" value={form.exchangeRate} onChange={e => set('exchangeRate', Number(e.target.value))} />
          </label>
          <label>
            {t('默认加价比例（%）', 'Default markup (%)')}
            <input required type="number" min="0" max="1000" step="0.1" value={form.markupPercent} onChange={e => set('markupPercent', Number(e.target.value))} />
          </label>
        </div>
        <p className="field-hint">{t('提示：英文界面会自动按此汇率将人民币售价换算为美元（$ USD）展示；未单独设置独立加价的供货商均使用此默认加价比例。', 'English view converts CNY prices to USD using this exchange rate. Suppliers without a custom markup use this default markup.')}</p>
        <label className="check-label">
          <input type="checkbox" checked={recalculatePrices} onChange={e => setRecalculatePrices(e.target.checked)} />
          {t('保存时按最新汇率与加价重算所有供货商商品价格（保留曾手动改过的商品售价）', 'Recalculate supplier product prices on save (keep manual price overrides)')}
        </label>
        <label className="check-label">
          <input type="checkbox" checked={clearPriceOverrides} onChange={e => setClearPriceOverrides(e.target.checked)} />
          {t('同时清除手动改价记录，全部恢复为公式自动定价', 'Also clear manual price overrides and reset all supplier products to formula pricing')}
        </label>

        <h3>{t('2. 店铺名称与顶部公告栏', '2. Store name & announcement bar')}</h3>
        <label>
          {t('店铺名称', 'Store name')}
          <input required maxLength={80} value={form.storeName} onChange={e => set('storeName', e.target.value)} />
        </label>
        <div className="form-columns">
          <label>
            {t('顶部公告栏（中文）', 'Top announcement (Chinese)')}
            <input maxLength={200} value={form.announcementZh} onChange={e => set('announcementZh', e.target.value)} />
          </label>
          <label>
            {t('顶部公告栏（英文）', 'Top announcement (English)')}
            <input maxLength={200} value={form.announcementEn} onChange={e => set('announcementEn', e.target.value)} />
          </label>
        </div>

        <h3>{t('3. 客服联系方式', '3. Customer support contacts')}</h3>
        <div className="form-columns">
          <label>
            {t('客服邮箱（Email）', 'Support email')}
            <input maxLength={120} value={form.supportEmail} onChange={e => set('supportEmail', e.target.value)} placeholder="support@example.com" />
          </label>
          <label>
            {t('客服微信（WeChat）', 'Support WeChat')}
            <input maxLength={120} value={form.supportWechat} onChange={e => set('supportWechat', e.target.value)} placeholder="support_wechat" />
          </label>
        </div>
        <label>
          {t('客服 Telegram', 'Support Telegram')}
          <input maxLength={200} value={form.supportTelegram} onChange={e => set('supportTelegram', e.target.value)} placeholder="t.me/support_contact" />
        </label>

        <button className="button primary" disabled={busy}>{busy && <Spinner />}{t('保存全部自定义设置', 'Save custom settings')}</button>
      </form>
    </div>
  );
}

function ProdsellerModal({ config, mode, busy, error, onClose, onSave }: {
  config?: ProdsellerConfig; mode: string; busy: boolean; error: string;
  onClose: () => void; onSave: (data: unknown) => void;
}) {
  const { t } = useLang();
  const [form, setForm] = useState(() => ({
    name: config?.name ?? 'ProdSeller',
    baseUrl: config?.baseUrl ?? 'https://prodseller.com/v1',
    authHeader: config?.authHeader ?? 'X-API-Key',
    authPrefix: config?.authPrefix ?? '',
    paths: { ...(config?.paths ?? defaultPaths) },
    apiKey: '',
    enabled: config?.enabled !== false,
    markupPercent: config?.markupPercent !== null && config?.markupPercent !== undefined ? String(config.markupPercent) : '',
    autoEnable: config?.autoEnable !== false,
  }));
  const setPath = (key: keyof Paths, value: string) => setForm(old => ({ ...old, paths: { ...old.paths, [key]: value } }));
  return (
    <Modal title={t('编辑与自定义主供货商', 'Edit & customize primary supplier')} onClose={onClose} wide>
      <form className="form-stack" onSubmit={e => {
        e.preventDefault();
        const { markupPercent, ...rest } = form;
        onSave({ ...rest, markupPercent: markupPercent.trim() === '' ? null : Number(markupPercent) });
      }}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-columns">
          <label>{t('供货商名称', 'Supplier name')}<input required maxLength={80} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
          <label>{t('API 基础地址', 'API base URL')}<input type="url" required maxLength={500} value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} /></label>
        </div>
        <label>{t('API Key（加密保存）', 'API key (encrypted)')}<input type="password" autoComplete="new-password" spellCheck={false} required={mode === 'demo'} minLength={form.apiKey ? 8 : undefined} maxLength={256} value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} placeholder={config?.hasKey ? t('已加密保存，留空保持不变', 'Saved securely; leave blank to keep it') : t('输入密钥，保存后不可查看', 'Enter the key; it will not be shown again')} /></label>
        <div className="form-columns">
          <label>{t('认证请求头', 'Authentication header')}<input required value={form.authHeader} onChange={e => setForm(f => ({ ...f, authHeader: e.target.value }))} /></label>
          <label>{t('密钥前缀（可选）', 'Key prefix (optional)')}<input value={form.authPrefix} onChange={e => setForm(f => ({ ...f, authPrefix: e.target.value }))} /></label>
        </div>
        <div className="form-columns">
          <label>
            {t('独立加价比例 %（可选）', 'Custom markup % (optional)')}
            <input type="number" min="0" max="1000" step="any" value={form.markupPercent} onChange={e => setForm(f => ({ ...f, markupPercent: e.target.value }))} placeholder={t('留空则跟随店铺全局加价', 'Leave blank to use store default')} />
          </label>
          <label>
            {t('新同步商品默认状态', 'New synced products default')}
            <select value={form.autoEnable ? '1' : '0'} onChange={e => setForm(f => ({ ...f, autoEnable: e.target.value === '1' }))}>
              <option value="1">{t('默认自动上架销售', 'Publish automatically')}</option>
              <option value="0">{t('默认下架（人工审核后上架）', 'Keep hidden until reviewed')}</option>
            </select>
          </label>
        </div>
        <div className="form-columns">
          {([['products', t('商品列表路径', 'Products path')], ['product', t('商品详情路径', 'Product detail path')], ['orders', t('创建订单路径', 'Create order path')], ['order', t('订单查询路径', 'Order detail path')], ['balance', t('余额路径（可选）', 'Balance path (optional)')]] as [keyof Paths, string][]).map(([key, label]) => (
            <label key={key}>{label}<input required={key !== 'balance'} value={form.paths[key]} onChange={e => setPath(key, e.target.value)} /></label>
          ))}
        </div>
        <label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />{t('启用该供货商并在前台展示其已上架商品', 'Enable this supplier and show its published products')}</label>
        <button className="button primary full" disabled={busy}>{busy && <Spinner />}{t('验证并保存', 'Verify and save')}</button>
      </form>
    </Modal>
  );
}

function ProductForm({ product, error, busy, onClose, onSave }: {
  error: string; product: Product | 'new'; busy: boolean;
  onClose: () => void; onSave: (data: unknown) => void;
}) {
  const { t } = useLang();
  const p = product === 'new' ? undefined : product;
  const [form, setForm] = useState({
    name: p?.name ?? '', nameEn: p?.nameEn ?? '',
    description: p?.description ?? '', descriptionEn: p?.descriptionEn ?? '',
    price: p ? money(p.priceCents) : '', category: p?.category ?? 'tools',
    delivery: p?.delivery ?? 'instant', requiresEmail: p?.requiresEmail ?? false,
    enabled: p?.enabled ?? true, inStock: p?.inStock ?? true,
  });
  const change = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));
  return (
    <Modal title={p ? t('编辑商品', 'Edit product') : t('添加自营商品', 'Add your own product')} onClose={onClose}>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={e => { e.preventDefault(); onSave({ ...form, priceCents: Math.round(Number(form.price) * 100) }); }}>
        <div className="form-columns">
          <label>{t('商品名称（中文）', 'Product name (Chinese)')}<input required maxLength={100} value={form.name} onChange={e => change('name', e.target.value)} /></label>
          <label>{t('商品名称（英文）', 'Product name (English)')}<input maxLength={100} value={form.nameEn} onChange={e => change('nameEn', e.target.value)} /></label>
        </div>
        <label>{t('商品说明（中文）', 'Description (Chinese)')}<textarea required rows={3} maxLength={4000} value={form.description} onChange={e => change('description', e.target.value)} /></label>
        <label>{t('商品说明（英文）', 'Description (English)')}<textarea rows={3} maxLength={4000} value={form.descriptionEn} onChange={e => change('descriptionEn', e.target.value)} /></label>
        <div className="form-columns">
          <label>{t('售价（人民币）', 'Retail price (CNY)')}<input required type="number" min="0.01" step="0.01" max="100000" value={form.price} onChange={e => change('price', e.target.value)} /></label>
          <label>{t('商品分类', 'Category')}
            <select value={form.category} onChange={e => change('category', e.target.value)}>
              {[['services', '账号与验证', 'Account services'], ['ai', 'AI 工具', 'AI tools'], ['streaming', '影音娱乐', 'Entertainment'], ['design', '创意设计', 'Creative'], ['tools', '效率办公', 'Productivity'], ['gaming', '游戏服务', 'Gaming']].map(([v, zh, en]) => <option key={v} value={v}>{t(zh, en)}</option>)}
            </select>
          </label>
        </div>
        {!p && (
          <>
            <label>{t('交付方式', 'Delivery method')}
              <select value={form.delivery} onChange={e => change('delivery', e.target.value)}>
                <option value="instant">{t('卡密库存自动发货', 'Automatic key inventory')}</option>
                <option value="manual">{t('店铺人工交付', 'Manual store fulfillment')}</option>
              </select>
            </label>
            <label className="check-label"><input type="checkbox" checked={form.requiresEmail} onChange={e => change('requiresEmail', e.target.checked)} />{t('下单时需要客户提供开通邮箱', 'Require activation emails at checkout')}</label>
          </>
        )}
        {p && p.stock === null && <label className="check-label"><input type="checkbox" checked={form.inStock} onChange={e => change('inStock', e.target.checked)} />{t('有货可售', 'In stock')}</label>}
        <label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => change('enabled', e.target.checked)} />{t('上架到商城', 'Publish in the storefront')}</label>
        {!p && form.delivery === 'instant' && <p className="field-hint">{t('保存后点击“导入卡密”补充库存，才可购买。', 'After saving, import keys to make this product available.')}</p>}
        <button className="button primary full" disabled={busy}>{busy && <Spinner />}{t('保存商品', 'Save product')}</button>
      </form>
    </Modal>
  );
}

function ChannelForm({ channel, busy, onSave }: { channel: Channel; busy: boolean; onSave: (v: unknown) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState(channel);
  return (
    <form className="admin-panel channel-form" onSubmit={e => { e.preventDefault(); onSave(form); }}>
      <div className="panel-heading">
        <h3>{t(...channelNames[channel.id])}</h3>
        <ToggleSwitch
          checked={form.enabled}
          disabled={busy}
          label={t(...channelNames[channel.id])}
          activeText={t('已启用', 'Enabled')}
          inactiveText={t('已停用', 'Disabled')}
          onChange={next => setForm(f => ({ ...f, enabled: next }))}
        />
      </div>
      <label>{t('收款说明（中文）', 'Payment instructions (Chinese)')}<textarea rows={4} required={form.enabled} maxLength={4000} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder={t('收款账号、收款人、币种及转账要求…', 'Receiving account, payee, currency and transfer instructions…')} /></label>
      <label>{t('收款说明（英文）', 'Payment instructions (English)')}<textarea rows={3} maxLength={4000} value={form.instructionsEn} onChange={e => setForm(f => ({ ...f, instructionsEn: e.target.value }))} /></label>
      <label>{t('收款二维码图片地址（可选）', 'QR image URL (optional)')}<input type="url" pattern="https://.*" placeholder="https://…" value={form.qrUrl} onChange={e => setForm(f => ({ ...f, qrUrl: e.target.value }))} /></label>
      <button className="button secondary" disabled={busy}>{t('保存设置', 'Save settings')}</button>
    </form>
  );
}
