import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { Config } from './config.js';
import { AppError } from './types.js';

function toPem(raw: string, label: 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'PUBLIC KEY'): string {
  const clean = raw.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function shanghaiTimestamp(date = new Date()): string {
  const shanghai = new Date(date.getTime() + 8 * 3600_000);
  return shanghai.toISOString().replace('T', ' ').slice(0, 19);
}

export function buildAlipayAppUrl(qrUrl: string): string {
  return `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(qrUrl)}`;
}

export class AlipayGateway {
  readonly gatewayUrl: string;
  readonly appId: string;
  private privateKey?: KeyObject;
  private publicKeys: KeyObject[] = [];
  private qrCache = new Map<string, { qrUrl: string; appUrl: string; expiresAt: number }>();

  constructor(private config: Config) {
    this.gatewayUrl = config.AIPAY_GATEWAY_URL || 'https://openapi.alipay.com/gateway.do';
    this.appId = config.AIPAY_APP_ID.trim();
    if (this.appId && (config.AIPAY_PRIVATE_KEY || config.AIPAY_PRIVATE_PKCS_KEY)) {
      try {
        this.privateKey = config.AIPAY_PRIVATE_KEY
          ? createPrivateKey(toPem(config.AIPAY_PRIVATE_KEY, 'PRIVATE KEY'))
          : createPrivateKey(toPem(config.AIPAY_PRIVATE_PKCS_KEY, 'RSA PRIVATE KEY'));
      } catch {
        if (config.AIPAY_PRIVATE_PKCS_KEY) {
          this.privateKey = createPrivateKey(toPem(config.AIPAY_PRIVATE_PKCS_KEY, 'RSA PRIVATE KEY'));
        }
      }
    }
    for (const raw of [config.AIPAY_ALIPAY_PUBLIC_KEY, config.AIPAY_PUBLIC_KEY]) {
      if (!raw?.trim()) continue;
      try { this.publicKeys.push(createPublicKey(toPem(raw, 'PUBLIC KEY'))); } catch { /* ignore invalid */ }
    }
  }

  get enabled(): boolean {
    return Boolean(this.appId && this.privateKey && this.publicKeys.length > 0);
  }

  signParams(params: Record<string, string>): string {
    if (!this.privateKey) throw new AppError(400, '支付宝密钥尚未配置', 'PAYMENT_UNAVAILABLE');
    const content = Object.keys(params)
      .sort()
      .filter(k => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return cryptoSign('RSA-SHA256', Buffer.from(content, 'utf8'), this.privateKey).toString('base64');
  }

  verifyCallback(params: Record<string, unknown>): boolean {
    if (!this.enabled) return false;
    const signature = typeof params.sign === 'string' ? params.sign : '';
    if (!signature) return false;
    const build = (includeSignType: boolean) => Object.keys(params)
      .sort()
      .filter(k => k !== 'sign' && (includeSignType || k !== 'sign_type') && typeof params[k] === 'string' && params[k] !== '')
      .map(k => `${k}=${params[k]}`)
      .join('&');
    const candidates = [build(false), build(true)];
    const sigBuf = Buffer.from(signature, 'base64');
    return this.publicKeys.some(pub => candidates.some(content => {
      try { return cryptoVerify('RSA-SHA256', Buffer.from(content, 'utf8'), pub, sigBuf); }
      catch { return false; }
    }));
  }

  buildPagePayUrl(order: { id: string; productName: string; quantity: number; totalCents: number }): string {
    if (!this.enabled) throw new AppError(400, '支付宝在线支付尚未启用', 'PAYMENT_UNAVAILABLE');
    const base = this.config.APP_URL.replace(/\/$/, '');
    const params: Record<string, string> = {
      app_id: this.appId,
      method: 'alipay.trade.page.pay',
      format: 'json',
      charset: 'UTF-8',
      sign_type: 'RSA2',
      timestamp: shanghaiTimestamp(),
      version: '1.0',
      return_url: `${base}/api/payments/alipay/return`,
      notify_url: `${base}/api/payments/alipay/notify`,
      biz_content: JSON.stringify({
        out_trade_no: order.id,
        total_amount: (order.totalCents / 100).toFixed(2),
        subject: `${order.productName} x ${order.quantity}`.slice(0, 120),
        product_code: 'FAST_INSTANT_TRADE_PAY',
      }),
    };
    const sign = this.signParams(params);
    const search = new URLSearchParams({ ...params, sign });
    return `${this.gatewayUrl}?${search.toString()}`;
  }

  async resolvePayUrls(order: { id: string; productName: string; quantity: number; totalCents: number }): Promise<{ url: string; qrUrl?: string; appUrl?: string }> {
    const url = this.buildPagePayUrl(order);
    if (process.env.NODE_ENV === 'test') {
      const qrUrl = `https://qr.alipay.com/mock_${order.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
      return { url, qrUrl, appUrl: buildAlipayAppUrl(qrUrl) };
    }
    const cached = this.qrCache.get(order.id);
    if (cached && cached.expiresAt > Date.now()) {
      return { url, qrUrl: cached.qrUrl, appUrl: cached.appUrl };
    }
    try {
      const cookies = new Map<string, string>();
      let current = url;
      for (let hop = 0; hop < 5; hop++) {
        const cookieHeader = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
        const res = await fetch(current, {
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          signal: AbortSignal.timeout(4500),
        });
        for (const sc of res.headers.getSetCookie?.() ?? []) {
          const pair = sc.split(';')[0] ?? '';
          const eq = pair.indexOf('=');
          if (eq > 0) {
            const k = pair.slice(0, eq).trim();
            const v = pair.slice(eq + 1).trim();
            if (v && !sc.includes('1970')) cookies.set(k, v);
          }
        }
        const loc = res.headers.get('location');
        if (loc && res.status >= 300 && res.status < 400) {
          current = new URL(loc, current).toString();
          continue;
        }
        const html = new TextDecoder('gbk').decode(await res.arrayBuffer());
        const qrUrl = html.match(/https?:\/\/qr\.alipay\.com\/[a-zA-Z0-9]+/)?.[0];
        if (qrUrl) {
          const appUrl = buildAlipayAppUrl(qrUrl);
          this.qrCache.set(order.id, { qrUrl, appUrl, expiresAt: Date.now() + 4 * 60_000 });
          return { url, qrUrl, appUrl };
        }
        break;
      }
    } catch { /* fallback to web cashier url */ }
    return { url };
  }

  async queryPaidTrade(orderId: string, expectedCents: number): Promise<{ tradeNo: string } | undefined> {
    if (!this.enabled || process.env.NODE_ENV === 'test') return undefined;
    try {
      const params: Record<string, string> = {
        app_id: this.appId,
        method: 'alipay.trade.query',
        format: 'json',
        charset: 'UTF-8',
        sign_type: 'RSA2',
        timestamp: shanghaiTimestamp(),
        version: '1.0',
        biz_content: JSON.stringify({ out_trade_no: orderId }),
      };
      const sign = this.signParams(params);
      const res = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ ...params, sign }).toString(),
        signal: AbortSignal.timeout(3500),
      });
      const data = await res.json() as { alipay_trade_query_response?: Record<string, unknown>; sign?: string };
      const resp = data.alipay_trade_query_response;
      const respSign = typeof data.sign === 'string' ? data.sign : '';
      if (!resp || !respSign) return undefined;
      const rawJson = JSON.stringify(resp);
      const sigBuf = Buffer.from(respSign, 'base64');
      const verified = this.publicKeys.some(pub => {
        try { return cryptoVerify('RSA-SHA256', Buffer.from(rawJson, 'utf8'), pub, sigBuf); }
        catch { return false; }
      });
      if (!verified) return undefined;
      if (resp.code === '10000' && (resp.trade_status === 'TRADE_SUCCESS' || resp.trade_status === 'TRADE_FINISHED')) {
        if (Number(resp.total_amount).toFixed(2) === (expectedCents / 100).toFixed(2)) {
          return { tradeNo: typeof resp.trade_no === 'string' && resp.trade_no ? resp.trade_no : orderId };
        }
      }
    } catch { /* ignore transient query errors */ }
    return undefined;
  }
}
