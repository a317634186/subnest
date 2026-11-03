export interface Product {
  id: string; name: string; nameEn: string; description: string; descriptionEn: string;
  category: string; brand: string; priceCents: number; inStock: boolean; requiresEmail: boolean;
  delivery: string; demo: boolean; stock: number | null; provider?: string; enabled?: boolean; costUsdt?: number;
  maxQuantity: number; providerName?: string; inputKind?: '' | 'pixel' | 'sheerid'; updatedAt?: string; soldCount?: number;
}
export interface Channel { id: string; enabled: boolean; available: boolean; instructions: string; instructionsEn: string; qrUrl: string }
export interface ShopConfig { storeName: string; demo: boolean; supplierDemo: boolean; currency: string; exchangeRate?: number; supportEmail: string; supportWechat?: string; supportTelegram?: string; announcementZh?: string; announcementEn?: string; alipayGateway?: string; channels: Channel[] }
export const defaultSupport = { email: 'support@example.com', wechat: 'support_wechat', telegram: 't.me/support_contact', telegramUrl: 'https://t.me/support_contact' };
export interface Order {
  id: string; productName: string; quantity: number; totalCents: number; status: string; paymentStatus: string;
  paymentChannel: string; demo: boolean; email: string; activationEmails: string[]; paymentReference: string;
  keys: string[]; instructions: string[]; eta?: string; createdAt: string; updatedAt: string;
  provider?: string; supplierOrderId?: string; lastError?: string; attempts?: number; canReconcile?: boolean; serviceAccount?:string;
  inputKind?: '' | 'pixel' | 'sheerid';
}
export interface Receipt { id: string; token: string }
export class ApiError extends Error { constructor(message: string, public code: string, public status: number) { super(message); } }
export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET', credentials: 'same-origin',
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data;
  try { data = await response.json(); } catch { throw new ApiError('服务暂时不可用，请稍后重试', 'INTERNAL_ERROR', response.status); }
  if (!response.ok) throw new ApiError(data.error ?? '请求失败', data.code ?? 'REQUEST_FAILED', response.status);
  return data;
}
export const money = (cents: number, lang = 'zh', exchangeRate = 7.2) => {
  if (lang === 'en') {
    const rate = exchangeRate > 0 ? exchangeRate : 7.2;
    const usd = cents > 0 ? Math.max(0.01, cents / 100 / rate) : 0;
    return usd.toFixed(2);
  }
  return (cents / 100).toFixed(2);
};
export const formatMoney = (cents: number, lang = 'zh', exchangeRate = 7.2) => `${lang === 'en' ? '$' : '¥'}${money(cents, lang, exchangeRate)}`;
export function receipts(): Receipt[] {
  try { return JSON.parse(localStorage.getItem('subnest-receipts') ?? '[]'); } catch { return []; }
}
export function saveReceipt(receipt: Receipt) {
  const list = receipts();
  localStorage.setItem('subnest-receipts', JSON.stringify([receipt, ...list.filter(r => r.id !== receipt.id)].slice(0, 100)));
}
export const channelNames: Record<string, [string,string]> = { alipay: ['支付宝', 'Alipay'], wechat: ['微信支付', 'WeChat Pay'], bank: ['银行卡转账', 'Bank transfer'], binance: ['币安转账', 'Binance transfer'] };
export const statuses: Record<string,[string,string]> = {
  awaiting_payment: ['等待付款','Awaiting payment'], payment_review: ['等待核款','Payment review'], paid: ['已付款','Paid'],
  processing: ['交付处理中','Processing'], activating: ['等待开通 / 交付','Awaiting fulfillment'], delivered: ['交付完成','Delivered'], needs_attention: ['店铺处理中','Store assistance'], cancelled: ['已关闭','Closed'],
  awaiting_input:['等待提交任务资料','Awaiting task details'],
};
