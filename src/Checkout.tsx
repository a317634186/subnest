import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Download, LockKeyhole, Mail, Minus, Plus, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { api, defaultSupport, money, formatMoney, receipts, saveReceipt, channelNames, type Product, type ShopConfig, type Receipt, type Order } from './api';
import { useLang, errorText, Modal, ProductIcon, Spinner, Status, Empty } from './ui';

export function Checkout({ product, config, onClose, onOrder }: { product: Product; config: ShopConfig; onClose: () => void; onOrder: (r: Receipt) => void }) {
  const { lang, t } = useLang(); const [quantity, setQuantity] = useState(1); const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [emails, setEmails] = useState<string[]>([]); const [channel, setChannel] = useState(config.channels[0]?.id ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const name = lang === 'en' && product.nameEn ? product.nameEn : product.name;
  const description = lang === 'en' && product.descriptionEn ? product.descriptionEn : product.description;
  const validity = name.match(/\b\d+(?:[.,]\d+)?\s*(?:days?|weeks?|months?|years?|hours?)\b|\d+\s*(?:天|日|个月|月|年|周|小时)/i)?.[0];
  const rate = config.exchangeRate || 7.2;
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError(t('请输入有效的联系邮箱。','Enter a valid contact email.')); return; }
    if (normalizedEmail !== confirmEmail.trim().toLowerCase()) { setError(t('两次填写的邮箱不一致。','The email addresses do not match.')); return; }
    setBusy(true);
    try {
      const details = { productId: product.id, quantity, email: email.trim(), activationEmails: product.requiresEmail ? Array.from({ length: quantity }, (_, i) => emails[i] ?? '') : [], paymentChannel: channel, expectedUnitPrice: product.priceCents };
      const fingerprint = JSON.stringify(details);
      const cached = JSON.parse(sessionStorage.getItem('subnest-checkout') ?? 'null');
      const draft = cached?.fingerprint === fingerprint ? cached : { fingerprint, checkoutId: crypto.randomUUID(), accessToken: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') };
      sessionStorage.setItem('subnest-checkout', JSON.stringify(draft));
      const order = await api<Order>('/orders', { method: 'POST', body: { ...details, checkoutId: draft.checkoutId, accessToken: draft.accessToken } });
      const receipt = { id: order.id, token: draft.accessToken }; saveReceipt(receipt);
      sessionStorage.removeItem('subnest-checkout'); onOrder(receipt);
    } catch (e) { setError(errorText(e, lang)); } finally { setBusy(false); }
  }
  return <Modal title={t('确认你的订阅','Make it yours')} onClose={onClose}>
    <section className="checkout-section"><h3>{t('商品摘要','Product summary')}</h3><div className="checkout-product"><ProductIcon brand={product.brand} name={`${product.name} ${product.nameEn}`}/><div><h4>{name}</h4><span className="muted">{product.delivery === 'instant' ? t('核款后自动交付','Automatic delivery after payment review') : t('核款后安排开通 / 交付','Activation / fulfillment after payment review')}</span></div></div></section>
    <section className="checkout-section"><h3>{t('有效期与使用步骤','Validity & instructions')}</h3>{validity && <p className="validity-line">{t('有效期','Validity')}: <strong>{validity}</strong></p>}<p className="product-description">{description || t('请以订单页中的商品信息和供货商使用说明为准。','Follow the product details and supplier instructions shown in your order.')}</p></section>
    <section className="checkout-section"><h3>{t('质保与退款','Warranty & refunds')}</h3><p className="policy-copy">{t('质保范围以本商品标题和详情标注为准；如遇交付问题，请先保留订单凭证并联系店铺核实。退款申请按商品说明及本店售后政策人工处理。','Warranty coverage follows the terms shown for this product. Keep your order receipt and contact the store if delivery fails. Refund requests are reviewed manually under the product terms and store policy.')}</p></section>
    {product.inputKind==='pixel'&&<div className="notice">{t('付款核实后，需提供本人 Gmail 密码和双重验证密钥。资料会加密保存并提交给该任务的供货商，提交后从订单中清除。','After payment review, this task requires your Gmail password and two-factor secret. They are encrypted, sent to the task supplier, then removed from the order.')}</div>}
    {product.inputKind==='sheerid'&&<div className="notice">{t('付款核实后，需提供本人且符合资格的 SheerID 验证链接，链接将提交给该任务的供货商。','After payment review, provide your own eligible SheerID verification link. It will be sent to the task supplier.')}</div>}
    {config.demo && <div className="notice">{t('当前为演示环境，商品与付款流程仅供体验，不会产生真实扣款。','Demo environment. Products and payments are for testing; no real charges occur.')}</div>}
    <form onSubmit={submit} className="form-stack">
      <div className="quantity-row"><span>{t('购买数量','Quantity')}</span><div className="stepper"><button type="button" aria-label={t('减少数量','Decrease quantity')} disabled={quantity <= 1 || busy} onClick={() => setQuantity(q => q - 1)}><Minus size={16}/></button><strong>{quantity}</strong><button type="button" aria-label={t('增加数量','Increase quantity')} disabled={quantity >= Math.min(product.maxQuantity ?? 20, product.stock ?? 20) || busy} onClick={() => setQuantity(q => q + 1)}><Plus size={16}/></button></div></div>
      <label>{t('联系邮箱','Contact email')}<input type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" value={email} disabled={busy} onChange={e => setEmail(e.target.value)}/></label>
      <label>{t('再次确认联系邮箱','Confirm contact email')}<input type="email" required maxLength={254} autoComplete="off" placeholder="you@example.com" value={confirmEmail} disabled={busy} onChange={e => setConfirmEmail(e.target.value)}/></label>
      {product.requiresEmail && <fieldset><legend><Mail size={15}/>{t('会员开通邮箱','Activation email addresses')}</legend><p className="field-hint">{t('每份商品填写一个邮箱，供应商将在该邮箱上开通会员。','Enter one email per unit. The subscription will be activated on these addresses.')}</p>{Array.from({length: quantity}, (_, i) => <input key={i} type="email" required maxLength={254} aria-label={`${t('开通邮箱','Activation email')} ${i+1}`} placeholder={`${t('开通邮箱','Activation email')} ${i+1}`} value={emails[i] ?? ''} disabled={busy} onChange={e => setEmails(old => { const next = [...old]; next[i] = e.target.value; return next; })}/>)}</fieldset>}
      <fieldset><legend>{t('选择付款方式','Payment method')}</legend><div className="payment-options">{config.channels.map(c => <label key={c.id} className={`payment-option ${channel === c.id ? 'selected' : ''}`}><input type="radio" name="payment-channel" value={c.id} checked={channel === c.id} onChange={() => setChannel(c.id)} disabled={busy}/><span className={`payment-mark ${c.id}`}>{c.id === 'alipay' ? '支' : c.id === 'wechat' ? '微' : c.id === 'binance' ? '◆' : <Wallet size={17}/>}</span>{t(...channelNames[c.id])}</label>)}</div>{!config.channels.length && <p className="error">{t('店铺尚未启用收款渠道，请稍后再来。','The store has not enabled a payment method yet.')}</p>}</fieldset>
      <label className="check-label"><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>{t('我已阅读商品说明并确认适用地区、账号要求和交付方式。','I have reviewed the description, region, account requirements and delivery method.')}</span></label>
      <div className="price-breakdown"><div><span>{t('商品单价','Unit price')}</span><strong>{formatMoney(product.priceCents, lang, rate)}</strong></div><div><span>{t('数量','Quantity')}</span><strong>× {quantity}</strong></div><div className="checkout-total"><span>{t('应付合计','Total due')}</span><strong>{formatMoney(product.priceCents * quantity, lang, rate)}</strong></div></div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="button primary full" disabled={busy || !channel}>{busy ? <Spinner/> : <LockKeyhole size={17}/>} {t('创建订单，前往付款','Create order & continue')}</button>
      <p className="form-note">{t('订单创建后可保存查询凭证，随时查看交付进度。','Save your recovery key after checkout to view delivery updates.')}</p>
    </form>
  </Modal>;
}

export function OrderDetail({ receipt, config, onClose }: { receipt: Receipt; config: ShopConfig; onClose: () => void }) {
  const { lang, t } = useLang(); const [order, setOrder] = useState<Order>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false); const [reference, setReference] = useState(''); const [alipay, setAlipay] = useState<{ url: string; qrUrl?: string; appUrl?: string }>();
  async function refresh() { try { const o = await api<Order>(`/orders/${receipt.id}`, { token: receipt.token }); setOrder(o); setError(''); } catch (e) { setError(errorText(e, lang)); } }
  useEffect(() => { void refresh(); }, [receipt.id]);
  useEffect(() => { if (order && order.paymentStatus !== 'paid' && order.paymentChannel === 'alipay' && config.alipayGateway) { void api<{url:string;qrUrl?:string;appUrl?:string}>(`/orders/${receipt.id}/alipay-url`, { method: 'POST', token: receipt.token, body: {} }).then(setAlipay).catch(() => {}); } }, [order?.id, order?.paymentStatus, order?.paymentChannel, config.alipayGateway]);
  useEffect(() => { if (!order || ['delivered','cancelled'].includes(order.status)) return; const onVis = () => { if (document.visibilityState === 'visible') void refresh(); }; document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis); }, [order?.id, order?.status]);
  useEffect(() => { if (!order || ['delivered','cancelled'].includes(order.status)) return; const timer = setTimeout(() => void refresh(), 15000); return () => clearTimeout(timer); }, [order]);
  async function action(kind: string) {
    setBusy(true); setError('');
    try { setOrder(await api<Order>(`/orders/${receipt.id}/${kind}`, { method: 'POST', token: receipt.token, body: kind === 'payment' ? { reference } : {} })); }
    catch (e) { setError(errorText(e, lang)); } finally { setBusy(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError(t('复制失败，请手动保存凭证。','Copy failed. Please save your key manually.')); } }
  function download() {
    const blob = new Blob([JSON.stringify({ store: 'SubNest', orderId: receipt.id, recoveryKey: receipt.token, recoveryCode: `${receipt.id}:${receipt.token}` }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `SubNest-${receipt.id.slice(0,8)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  const channel = config.channels.find(c => c.id === order?.paymentChannel);
  const rate = config.exchangeRate || 7.2;
  return <Modal title={t('订单详情','Your order')} onClose={onClose}>
    {error && <div className="error" role="alert">{error}</div>}
    {!order ? <div className="loading"><Spinner/>{t('正在读取订单','Loading your order')}</div> : <>
      <div className="order-heading"><div><h3>{order.productName}</h3><span className="muted">{t('数量','Quantity')} × {order.quantity}</span></div><Status status={order.status}/></div>
      <div className="order-meta"><span>{t('订单金额','Total')}<strong>{formatMoney(order.totalCents, lang, rate)} {t('CNY','USD')}</strong></span><span>{t('付款方式','Payment method')}<strong>{t(...channelNames[order.paymentChannel])}</strong></span><span>{t('联系邮箱','Contact email')}<strong>{order.email}</strong></span></div>
      <div className="recovery-box"><h4><ShieldCheck size={17}/>{t('保存订单查询凭证','Keep your recovery key')}</h4><p>{t('凭证可用于查询卡密，请自行保管。系统不会自动发送邮件。','This key unlocks your delivery details. Keep it private. No automatic email is sent.')}</p><code>{receipt.id}:{receipt.token}</code><div className="row"><button className="button secondary small" onClick={() => copy(`${receipt.id}:${receipt.token}`)}>{copied ? <Check size={15}/> : <Copy size={15}/>} {t('复制凭证','Copy key')}</button><button className="button secondary small" onClick={download}><Download size={15}/>{t('下载凭证','Download')}</button></div></div>
      {order.demo && <div className="notice">{t('演示订单 · 无需真实转账','Demo order · Do not send real money')}</div>}
      {order.status==='awaiting_input'&&order.inputKind&&<TaskDetailsForm kind={order.inputKind} receipt={receipt} onComplete={setOrder}/>}
      {order.paymentStatus !== 'paid' && <div className="payment-instructions"><h3>{t('完成付款','Complete payment')}</h3>{order.demo ? <p>{t('点击下方按钮体验付款后交付，或提交参考号测试人工核款。','Use the demo button to preview delivery, or submit a reference to test manual review.')}</p> : <><p className="pre-wrap">{lang === 'en' && channel?.instructionsEn ? channel.instructionsEn : channel?.instructions || t('请联系店铺获取最新收款信息。','Contact the store for payment details.')}</p>{channel?.qrUrl && <img className="payment-qr" src={channel.qrUrl} alt={t('收款二维码','Payment QR code')} referrerPolicy="no-referrer"/>}</>}
        {alipay?.appUrl && <button type="button" className="button primary full" onClick={() => { window.location.href = alipay.appUrl!; if (alipay.qrUrl) { setTimeout(() => { if (document.visibilityState === 'visible') window.location.href = alipay.qrUrl!; }, 1200); } }}>{t('打开支付宝 App 付款（手机端推荐）','Open Alipay App to Pay (Mobile)')}</button>}
        {alipay?.url && <a className={`button ${alipay.appUrl ? 'secondary' : 'primary'} full`} href={alipay.url} target="_blank" rel="noopener noreferrer">{t(alipay.appUrl ? '前往支付宝网页收银台（电脑端 / 扫码）' : '前往支付宝付款', alipay.appUrl ? 'Alipay Web Cashier (Desktop / QR)' : 'Pay with Alipay')}</a>}
        <form onSubmit={e => { e.preventDefault(); void action('payment'); }} className="form-stack"><label>{t('交易号 / 转账参考号','Transaction / transfer reference')}<input required minLength={3} maxLength={200} value={reference} onChange={e => setReference(e.target.value)} placeholder={t('填写付款记录中的编号','Reference from your payment record')}/></label><button className="button secondary full" disabled={busy}>{busy && <Spinner/>}{t('我已付款，提交核款','I have paid · Request review')}</button></form>
        {order.demo && <button className="button primary full" disabled={busy} onClick={() => action('demo-pay')}>{busy ? <Spinner/> : <Check size={17}/>} {t('模拟付款成功','Simulate successful payment')}</button>}
        {order.status === 'payment_review' && <p className="success-text">{t('已提交，店铺确认到账后将安排交付。','Submitted. Delivery starts once the store confirms receipt of payment.')}</p>}
      </div>}
      {order.status === 'delivered' && <div className="delivery-box"><h3><Check size={20}/>{t('你的商品已交付','Your delivery is ready')}</h3>{order.keys.map((key, i) => <div className="key-row" key={i}><code>{key}</code><button className="icon-button" aria-label={t('复制卡密','Copy delivery key')} onClick={() => copy(key)}><Copy size={16}/></button></div>)}</div>}
      {order.instructions.map((instruction, i) => <p key={i} className="notice pre-wrap">{instruction}</p>)}
      {['activating','processing','paid'].includes(order.status) && <p className="notice">{t('付款已确认，正在安排交付。页面每 15 秒更新一次。','Payment confirmed. Fulfillment is in progress. This page updates every 15 seconds.')}{order.eta && ` · ${order.eta}`}</p>}
      {order.status === 'needs_attention' && <p className="notice">{t('店铺正在处理此订单，请勿重复付款。可提供订单号联系客服。','This order needs store assistance. Do not pay again. Contact support with your order ID.')}</p>}
      <div className="support-inline"><span>{t('售后与问题联系：','Need help? Contact us:')}</span><a href={`mailto:${config.supportEmail||defaultSupport.email}`}>{config.supportEmail||defaultSupport.email}</a><span>WeChat: {config.supportWechat||defaultSupport.wechat}</span><a href={(config.supportTelegram||defaultSupport.telegram).startsWith('http')?(config.supportTelegram||defaultSupport.telegram):`https://${config.supportTelegram||defaultSupport.telegram}`} target="_blank" rel="noopener noreferrer">TG: {config.supportTelegram||defaultSupport.telegram}</a></div>
      <div className="order-bottom"><code>{order.id}</code><button className="text-button" onClick={refresh}><RefreshCw size={14}/>{t('刷新','Refresh')}</button></div>
    </>}
  </Modal>;
}

function TaskDetailsForm({kind,receipt,onComplete}:{kind:'pixel'|'sheerid';receipt:Receipt;onComplete:(o:Order)=>void}){
  const {lang,t}=useLang();const [gmail,setGmail]=useState('');const [password,setPassword]=useState('');const [totp,setTotp]=useState('');const [backup,setBackup]=useState('');const [link,setLink]=useState('');const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const serviceInput=kind==='pixel'?{kind,gmail,password,totp,backupCodes:backup.split(/[\s,，]+/).filter(Boolean)}:{kind,link};
    const result=await api<Order>(`/orders/${receipt.id}/service-input`,{method:'POST',token:receipt.token,body:{serviceInput,serviceConsent:consent}});
    setPassword('');setTotp('');setBackup('');setLink('');onComplete(result);
  }catch(e){setError(errorText(e,lang));}finally{setBusy(false);}}
  return <form className="form-stack task-details" onSubmit={submit}><h3>{t('提交任务资料','Submit task details')}</h3><p className="field-hint">{kind==='pixel'?t('资料会加密并仅用于此任务；付款核实后将提交给供货商，提交后从订单中清除密码及验证密钥。请仅提交你有权使用的账号。','Your details are encrypted and used only for this task. They are sent to the supplier after payment review, then the password and verification secret are removed from the order. Only submit an account you are authorized to use.'):t('请提供本人且符合服务资格的 SheerID 验证链接。链接会加密并提交给供货商，提交后从订单中清除。','Provide your own eligible SheerID verification link. It is encrypted and sent to the supplier, then removed from the order.')}</p>
    {kind==='pixel'?<><label>{t('Gmail 地址','Gmail address')}<input type="email" required maxLength={254} autoComplete="off" value={gmail} onChange={e=>setGmail(e.target.value)} placeholder="you@gmail.com"/></label><label>{t('Gmail 密码','Gmail password')}<input type="password" required maxLength={256} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>{t('双重验证密钥（32 位 Base32）','Two-factor secret (32-character Base32)')}<input type="password" required autoComplete="off" maxLength={64} value={totp} onChange={e=>setTotp(e.target.value)}/></label><label>{t('备用码（可选，填写 2–3 个，用逗号分隔）','Backup codes (optional, 2–3 comma-separated)')}<input type="password" autoComplete="off" maxLength={40} value={backup} onChange={e=>setBackup(e.target.value)}/></label></>:<label>{t('SheerID 验证链接','SheerID verification link')}<input type="url" required maxLength={2000} value={link} onChange={e=>setLink(e.target.value)} placeholder="https://services.sheerid.com/verify/…"/></label>}
    <label className="check-label"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>{kind==='pixel'?t('我确认有权使用此账号，并授权将上述资料交给供货商处理此任务。','I am authorized to use this account and consent to sending these details to the supplier for this task.'):t('我确认本人符合资格，并授权将此验证链接交给供货商处理。','I confirm that I am eligible and consent to sending this verification link to the supplier.')}</label>{error&&<p className="error" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy&&<Spinner/>}{t('提交资料并开始任务','Submit details and start task')}</button></form>;
}

export function MyOrders({ config, onOpen }: { config?: ShopConfig; onOpen: (r: Receipt) => void }) {
  const { lang, t } = useLang(); const rate = config?.exchangeRate || 7.2; const [items, setItems] = useState<(Order & Receipt)[]>([]); const [code, setCode] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [challenge,setChallenge]=useState<{id:string;question:string}>(); const [challengeAnswer,setChallengeAnswer]=useState('');
  async function refreshChallenge(){try{setChallenge(await api<{id:string;question:string}>('/order-challenge'));setChallengeAnswer('');}catch{setChallenge(undefined);}}
  useEffect(() => { void refreshChallenge(); void Promise.all(receipts().slice(0, 30).map(async r => { try { return { ...await api<Order>(`/orders/${r.id}`, { token: r.token }), ...r }; } catch { return null; } })).then(data => { setItems(data.filter(v => v !== null)); if(data.some(v => v === null)) setError(t('部分订单暂时无法读取，请稍后刷新或使用保存的凭证查询。','Some orders could not be loaded. Refresh later or use your saved recovery key.')); setLoading(false); }); }, []);
  async function recover(e: FormEvent) {
    e.preventDefault(); setError('');
    const [id, token] = code.trim().split(':');
    if (!/^[a-f0-9-]{36}$/i.test(id ?? '') || !/^[a-f0-9]{64}$/i.test(token ?? '')) { setError(t('请粘贴完整的“订单号:查询密钥”凭证。','Paste the complete orderId:recoveryKey code.')); return; }
    if (!challenge || !/^\d{1,2}$/.test(challengeAnswer)) { setError(t('请先完成验证码。','Solve the verification question first.')); return; }
    try { await api<Order>('/orders/lookup',{method:'POST',body:{id,token,challengeId:challenge.id,answer:Number(challengeAnswer)}}); const r = { id, token }; saveReceipt(r); onOpen(r); } catch(e) { setError(errorText(e, lang)); } finally { void refreshChallenge(); }
  }
  return <main className="container orders-page"><div className="section-intro"><span className="eyebrow">{t('专属订单中心','YOUR SUBSCRIPTIONS')}</span><h1>{t('我的订单','Your orders')}</h1><p>{t('在这里查看购买记录，领取你的数字商品。','Your purchases and digital deliveries, all in one place.')}</p></div><form className="lookup-form" onSubmit={recover}><LockKeyhole size={21}/><input aria-label={t('订单查询凭证','Order recovery key')} placeholder={t('换了设备？粘贴订单查询凭证','On a new device? Paste your recovery code')} value={code} onChange={e => setCode(e.target.value)}/><label className="order-captcha"><span>{t('验证码','Verification')}: {challenge?.question ?? '…'}</span><input aria-label={t('计算结果','Answer')} inputMode="numeric" pattern="[0-9]*" required maxLength={2} value={challengeAnswer} onChange={e=>setChallengeAnswer(e.target.value)} disabled={!challenge}/></label><button className="button primary">{t('查询订单','Find order')}</button></form>{error && <p className="error" role="alert">{error}</p>}
    {loading ? <div className="loading"><Spinner/></div> : items.length ? <div className="order-list">{items.map(o => <button className="order-list-item" key={o.id} onClick={() => onOpen({id:o.id,token:o.token})}><div><h3>{o.productName}</h3><span className="muted">{new Date(o.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')} · × {o.quantity}</span></div><Status status={o.status}/><strong>{formatMoney(o.totalCents, lang, rate)}</strong></button>)}</div> : <Empty title={t('还没有订单','No orders here yet')} text={t('浏览商品，找到适合你的下一份订阅。已有订单可以使用查询凭证找回。','Find your next subscription in the shop, or recover an existing order with its key.')}/>}
    <p className="form-note">{t('显示此浏览器保存的最近 30 笔订单。清理浏览器数据后，请用已下载的凭证找回。','Showing the latest 30 orders saved in this browser. Use your downloaded key if browser data is cleared.')}</p>
    <div className="support-inline"><span>{t('遇到问题请联系客服：','Need help? Contact support:')}</span><a href={`mailto:${config?.supportEmail||defaultSupport.email}`}>{t('邮件','Email')}: {config?.supportEmail||defaultSupport.email}</a><span>{t('微信','WeChat')}: {config?.supportWechat||defaultSupport.wechat}</span><a href={(config?.supportTelegram||defaultSupport.telegram).startsWith("http")?(config?.supportTelegram||defaultSupport.telegram):`https://${config?.supportTelegram||defaultSupport.telegram}`} target="_blank" rel="noopener noreferrer">TG: {config?.supportTelegram||defaultSupport.telegram}</a></div>
  </main>;
}
