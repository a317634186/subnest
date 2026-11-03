import { useEffect, useState, type FormEvent } from 'react';
import { Database, Eye, EyeOff, KeyRound, Plus, Power, RefreshCw, Settings2, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { api } from './api';
import { errorText, Modal, Spinner, useLang } from './ui';

export interface Paths { products: string; product: string; orders: string; order: string; balance: string }
export interface SupplierInfo {
  id: string; name: string; baseUrl: string; type: 'compatible' | 'quantumvault' | 'partner_jobs';
  authHeader: string; authPrefix: string; paths: Paths; enabled: boolean; supportsIdempotency: boolean;
  coinToCny: number; markupPercent: number | null; autoEnable: boolean; hasKey: boolean; pendingOrders: number;
  productCount?: number; enabledProductCount?: number; inStockProductCount?: number;
}
export const defaultPaths: Paths = { products: '/products', product: '/products/{productId}', orders: '/orders', order: '/orders/{orderId}', balance: '/balance' };
type FormData = {
  name: string; baseUrl: string; type: 'compatible' | 'quantumvault' | 'partner_jobs';
  authHeader: string; authPrefix: string; paths: Paths; apiKey: string; enabled: boolean;
  supportsIdempotency: boolean; coinToCny: number; markupPercent: string; autoEnable: boolean;
};
const blank = (): FormData => ({
  name: '', baseUrl: '', type: 'compatible', authHeader: 'X-API-Key', authPrefix: '',
  paths: { ...defaultPaths }, apiKey: '', enabled: true, supportsIdempotency: false,
  coinToCny: 1, markupPercent: '', autoEnable: true,
});

export function maskApiUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const parts = u.hostname.split(".");
    const host = parts.length >= 2
      ? `${parts[0].slice(0, 2)}***${parts[0].slice(-1)}.${parts.slice(1).join(".")}`
      : `${u.hostname.slice(0, 2)}***`;
    return `${u.protocol}//${host}${u.pathname && u.pathname !== "/" ? "/***" : ""}`;
  } catch {
    return "***";
  }
}

export function ToggleSwitch({ checked, disabled, onChange, label, activeText, inactiveText }: {
  checked: boolean; disabled?: boolean; onChange: (next: boolean) => void;
  label?: string; activeText?: string; inactiveText?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle-switch ${checked ? 'on' : 'off'}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {(activeText || inactiveText) && <span className="toggle-label">{checked ? activeText : inactiveText}</span>}
    </button>
  );
}

export default function SupplierManager({ onCatalogChange }: { onCatalogChange: () => void }) {
  const { lang, t } = useLang();
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [editing, setEditing] = useState<SupplierInfo | 'new'>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [revealedUrls, setRevealedUrls] = useState<Record<string, boolean>>({});

  async function load() {
    const data = await api<{ suppliers: SupplierInfo[] }>('/admin/suppliers');
    setSuppliers(data.suppliers);
  }
  useEffect(() => { void load().catch(e => setError(errorText(e, lang))); }, []);

  async function perform(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); onCatalogChange(); if (success) setNotice(success); }
    catch (e) { setError(errorText(e, lang)); }
    finally { setBusy(false); }
  }

  return (
    <section className="supplier-manager">
      <div className="panel-heading supplier-manager-heading">
        <div>
          <span className="eyebrow">{t('多供货商管理', 'MULTIPLE SUPPLIERS')}</span>
          <h2>{t('自定义供货商', 'Custom suppliers')}</h2>
          <p className="muted">{t('支持一键开关供货商、配置独立加价比例、修改 API 地址与加密密钥。API Key 保存后不可查看。', 'Toggle suppliers on/off, set custom markups, or edit API URLs and encrypted keys.')}</p>
        </div>
        <button className="button primary small" onClick={() => { setError(''); setEditing('new'); }}>
          <Plus size={15} />{t('添加供货商', 'Add supplier')}
        </button>
      </div>
      {error && !editing && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success-banner" role="status"><ShieldCheck size={16} />{notice}</p>}
      {!suppliers.length ? (
        <div className="supplier-empty">
          <Database size={25} />
          <div>
            <strong>{t('还没有自定义连接', 'No custom connections yet')}</strong>
            <p>{t('支持 QuantumVault、Pixel / SheerID 和 ProdSeller 兼容接口，也可以先保存未启用的连接预设。', 'Use QuantumVault, Pixel / SheerID or a ProdSeller-compatible preset, or save a disabled connection for later.')}</p>
          </div>
        </div>
      ) : (
        <div className="supplier-grid">
          {suppliers.map(s => (
            <article className={`admin-panel supplier-card ${!s.enabled ? 'supplier-disabled' : ''}`} key={s.id}>
              <div className="panel-heading">
                <div>
                  <h3>{s.name}</h3>
                  <span className="muted">
                    {s.type === 'quantumvault' ? 'QuantumVault' : s.type === 'partner_jobs' ? 'Pixel / SheerID' : t('ProdSeller 兼容接口', 'ProdSeller-compatible')}
                    {s.markupPercent !== null && s.markupPercent !== undefined ? ` · ${t(`独立加价 ${s.markupPercent}%`, `Markup ${s.markupPercent}%`)}` : ''}
                  </span>
                </div>
                <ToggleSwitch
                  checked={s.enabled}
                  disabled={busy}
                  label={t(`切换 ${s.name} 启用状态`, `Toggle ${s.name}`)}
                  activeText={t('已启用', 'Enabled')}
                  inactiveText={t('已停用', 'Disabled')}
                  onChange={next => void perform(
                    () => api(`/admin/suppliers/${s.id}/toggle`, { method: 'PATCH', body: { enabled: next } }).then(() => {}),
                    next ? t(`已启用供货商「${s.name}」`, `Supplier "${s.name}" enabled`) : t(`已停用供货商「${s.name}」，其商品已从前台隐藏`, `Supplier "${s.name}" disabled`),
                  )}
                />
              </div>
              <div className="supplier-card-body">
                <p className="supplier-url">{revealedUrls[s.id] ? s.baseUrl : maskApiUrl(s.baseUrl)} <button type="button" className="text-button" onClick={() => setRevealedUrls(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>{revealedUrls[s.id] ? <EyeOff size={13} /> : <Eye size={13} />}{revealedUrls[s.id] ? t("隐藏地址", "Hide") : t("显示地址", "Show")}</button></p>
                <div className="supplier-stats-row">
                  <span>{t('商品总数', 'Products')}: <strong>{s.productCount ?? 0}</strong></span>
                  <span>{t('已上架', 'Published')}: <strong>{s.enabledProductCount ?? 0}</strong></span>
                  <span>{t('有货', 'In stock')}: <strong>{s.inStockProductCount ?? 0}</strong></span>
                </div>
                <p className="muted">
                  <KeyRound size={14} /> {s.hasKey ? t('AES-256-GCM 密钥与接口已加密锁定（不可查看/导出）', 'AES-256-GCM encrypted & locked') : t('尚未配置密钥', 'No key saved')} · {s.authHeader}
                  {s.pendingOrders > 0 && ` · ${t(`${s.pendingOrders} 笔未完成订单`, `${s.pendingOrders} open orders`)}`}
                </p>
                {balances[s.id] && <p className="muted">{t('余额', 'Balance')}: <strong>{balances[s.id]}</strong></p>}
                <div className="row">
                  <button className="button secondary small" onClick={() => { setError(''); setEditing(s); }}>
                    <Settings2 size={14} />{t('编辑与自定义', 'Edit & customize')}
                  </button>
                  <button className="button secondary small" disabled={busy || !s.hasKey} onClick={() => perform(async () => {
                    const r = await api<{ count: number }>(`/admin/suppliers/${s.id}/test`, { method: 'POST', body: {} });
                    setNotice(t(`连接成功，读取到 ${r.count} 件商品`, `Connection successful; ${r.count} products read`));
                  })}>{t('测试连接', 'Test')}</button>
                  <button className="button secondary small" disabled={busy || !s.enabled} onClick={() => perform(
                    () => api('/admin/sync', { method: 'POST', body: { provider: s.id } }).then(() => {}),
                    t('供货商商品已同步', 'Supplier catalog synced'),
                  )}><RefreshCw size={14} />{t('同步商品', 'Sync')}</button>
                  {(s.type !== 'compatible' || s.paths.balance) && (
                    <button className="button secondary small" disabled={busy || !s.hasKey} onClick={() => perform(async () => {
                      const b = await api<{ balance: number; membership?: string }>(`/admin/suppliers/${s.id}/balance`);
                      setBalances(old => ({ ...old, [s.id]: `${b.balance.toFixed(2)} ${b.membership || 'USDT'}` }));
                    })}><Wallet size={14} />{t('查余额', 'Balance')}</button>
                  )}
                </div>
                <div className="supplier-actions">
                  <button type="button" className="text-button" disabled={busy || !(s.productCount ?? 0)} onClick={() => perform(
                    () => api('/admin/products/batch', { method: 'POST', body: { action: 'enable', provider: s.id } }).then(() => {}),
                    t(`已将「${s.name}」旗下全部商品设为上架`, `All products from "${s.name}" published`),
                  )}><Eye size={14} />{t('全部上架', 'Publish all')}</button>
                  <button type="button" className="text-button" disabled={busy || !(s.productCount ?? 0)} onClick={() => perform(
                    () => api('/admin/products/batch', { method: 'POST', body: { action: 'disable', provider: s.id } }).then(() => {}),
                    t(`已将「${s.name}」旗下全部商品设为下架`, `All products from "${s.name}" hidden`),
                  )}><EyeOff size={14} />{t('全部下架', 'Hide all')}</button>
                  <button type="button" className="text-button" disabled={busy} onClick={() => perform(
                    () => api(`/admin/suppliers/${s.id}/toggle`, { method: 'PATCH', body: { enabled: !s.enabled } }).then(() => {}),
                    s.enabled ? t('供货商已停用', 'Supplier disabled') : t('供货商已启用', 'Supplier enabled'),
                  )}><Power size={14} />{s.enabled ? t('停用供货商', 'Disable') : t('启用供货商', 'Enable')}</button>
                  <button type="button" className="text-button danger-text" disabled={busy} onClick={() => perform(
                    () => api(`/admin/suppliers/${s.id}`, { method: 'DELETE' }).then(() => {}),
                    t('供货商已删除', 'Supplier removed'),
                  )}><Trash2 size={14} />{t('删除', 'Delete')}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <SupplierModal
          supplier={editing}
          busy={busy}
          error={error}
          onClose={() => setEditing(undefined)}
          onSave={data => void perform(async () => {
            if (editing === 'new') await api('/admin/suppliers', { method: 'POST', body: data });
            else await api(`/admin/suppliers/${editing.id}`, { method: 'PUT', body: data });
            setEditing(undefined);
          }, t('供货商配置已保存', 'Supplier saved'))}
        />
      )}
    </section>
  );
}

function SupplierModal({ supplier, busy, error, onClose, onSave }: {
  supplier: SupplierInfo | 'new'; busy: boolean; error: string;
  onClose: () => void; onSave: (data: unknown) => void;
}) {
  const { t } = useLang();
  const previous = supplier === 'new' ? undefined : supplier;
  const [form, setForm] = useState<FormData>(() => previous ? {
    name: previous.name,
    baseUrl: previous.baseUrl,
    type: previous.type,
    authHeader: previous.authHeader,
    authPrefix: previous.authPrefix,
    paths: { ...previous.paths },
    apiKey: '',
    enabled: previous.enabled,
    supportsIdempotency: previous.supportsIdempotency,
    coinToCny: previous.coinToCny ?? 1,
    markupPercent: previous.markupPercent !== null && previous.markupPercent !== undefined ? String(previous.markupPercent) : '',
    autoEnable: previous.autoEnable !== false,
  } : blank());

  function set<K extends keyof FormData>(key: K, value: FormData[K]) { setForm(old => ({ ...old, [key]: value })); }
  function setPath(key: keyof Paths, value: string) { setForm(old => ({ ...old, paths: { ...old.paths, [key]: value } })); }
  function preset(type: FormData['type']) {
    setForm(old => ({
      ...old,
      type,
      baseUrl: type === 'quantumvault' ? 'https://www.quantumvault.me/api/v1' : type === 'partner_jobs' ? 'https://api.smm.io.vn/api/v2' : old.type !== 'compatible' ? '' : old.baseUrl,
      authHeader: 'X-API-Key',
      authPrefix: '',
      paths: { ...defaultPaths },
      supportsIdempotency: false,
      autoEnable: type === 'partner_jobs' ? false : true,
    }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const { markupPercent, ...rest } = form;
    onSave({
      ...rest,
      markupPercent: markupPercent.trim() === '' ? null : Number(markupPercent),
    });
  }
  return (
    <Modal title={previous ? t('编辑与自定义供货商', 'Edit & customize supplier') : t('添加供货商', 'Add supplier')} onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-columns">
          <label>{t('供货商名称', 'Supplier name')}<input required maxLength={80} value={form.name} onChange={e => set('name', e.target.value)} placeholder="QuantumVault" /></label>
          <label>{t('接口预设', 'API preset')}
            <select value={form.type} onChange={e => preset(e.target.value as FormData['type'])}>
              <option value="compatible">{t('ProdSeller 兼容接口', 'ProdSeller-compatible API')}</option>
              <option value="quantumvault">QuantumVault</option>
              <option value="partner_jobs">Pixel / SheerID</option>
            </select>
          </label>
        </div>
        <label>{t('API 基础地址', 'API base URL')}<input type="url" required maxLength={500} value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://supplier.example/api/v1" /></label>
        <label>{t('API Key（加密保存）', 'API key (encrypted)')}<input type="password" autoComplete="new-password" spellCheck={false} minLength={form.apiKey ? 8 : undefined} maxLength={256} value={form.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder={previous?.hasKey ? t('已加密保存，留空保持不变', 'Saved securely; leave blank to keep it') : t('输入密钥，保存后不可查看', 'Enter the key; it will not be shown again')} /></label>
        <p className="field-hint">{t('密钥仅在服务器加密保存，不会回显；留空则保留原密钥。', 'The key is encrypted on the server and never returned. Leave blank to keep the existing key.')}</p>
        <div className="form-columns">
          <label>{t('认证请求头', 'Authentication header')}<input required value={form.authHeader} onChange={e => set('authHeader', e.target.value)} placeholder="X-API-Key" /></label>
          <label>{t('密钥前缀（可选）', 'Key prefix (optional)')}<input value={form.authPrefix} onChange={e => set('authPrefix', e.target.value)} placeholder="Bearer " /></label>
        </div>
        <div className="form-columns">
          <label>
            {t('独立加价比例 %（可选）', 'Custom markup % (optional)')}
            <input type="number" min="0" max="1000" step="any" value={form.markupPercent} onChange={e => set('markupPercent', e.target.value)} placeholder={t('留空则使用店铺默认加价', 'Leave blank to use store default')} />
          </label>
          {form.type === 'partner_jobs' ? (
            <label>{t('1 coin 的成本（人民币）', 'Cost per coin (CNY)')}<input required type="number" min="0.0001" max="100000" step="any" value={form.coinToCny} onChange={e => set('coinToCny', Number(e.target.value))} /></label>
          ) : (
            <label>{t('新同步商品默认状态', 'New synced products default')}
              <select value={form.autoEnable ? '1' : '0'} onChange={e => set('autoEnable', e.target.value === '1')}>
                <option value="1">{t('默认自动上架销售', 'Publish automatically')}</option>
                <option value="0">{t('默认下架（人工审核后上架）', 'Keep hidden until reviewed')}</option>
              </select>
            </label>
          )}
        </div>
        {form.type === 'compatible' ? (
          <>
            <div className="form-columns">
              {([['products', t('商品列表路径', 'Products path')], ['product', t('商品详情路径', 'Product detail path')], ['orders', t('创建订单路径', 'Create order path')], ['order', t('订单查询路径', 'Order detail path')], ['balance', t('余额路径（可选）', 'Balance path (optional)')]] as [keyof Paths, string][]).map(([key, label]) => (
                <label key={key}>{label}<input required={key !== 'balance'} value={form.paths[key]} onChange={e => setPath(key, e.target.value)} /></label>
              ))}
            </div>
            <p className="field-hint">{t('兼容预设要求商品、下单及交付数据与 ProdSeller API 相同；详情路径使用 {productId} 和 {orderId}。', 'This preset requires ProdSeller-compatible product, purchase and delivery formats. Use {productId} and {orderId} in detail paths.')}</p>
            <label className="check-label"><input type="checkbox" checked={form.supportsIdempotency} onChange={e => set('supportsIdempotency', e.target.checked)} />{t('我已确认该接口支持 Idempotency-Key 防重复采购', 'I verified that the API supports Idempotency-Key for safe retries')}</label>
          </>
        ) : form.type === 'quantumvault' ? (
          <p className="notice">{t('QuantumVault 使用官方 API 预设。由于接口不支持安全重试，每次限购一件；遇到超时会等待商家核对，避免重复扣款。', 'QuantumVault uses its official API preset. It cannot safely retry purchases, so each order is limited to one unit and timeouts require merchant review.')}</p>
        ) : (
          <p className="notice">{t('Pixel 与 SheerID 任务默认不公开上架，请在商品管理中核对价格后启用。客户只在付款核实后提交资料，并明确授权转交供货商。', 'Pixel and SheerID tasks are hidden by default. Review prices and enable them in Products.')}</p>
        )}
        <label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />{t('启用该供货商并在前台展示其已上架商品', 'Enable this supplier and show its published products')}</label>
        {previous?.pendingOrders ? <p className="notice">{t('该供货商有未完成订单；处理完订单后才能更改接口或密钥。', 'This supplier has open orders. Finish them before changing its API or key.')}</p> : null}
        <button className="button primary full" disabled={busy}>{busy && <Spinner />}{form.enabled ? t('验证并保存', 'Verify and save') : t('保存配置', 'Save settings')}</button>
      </form>
    </Modal>
  );
}
