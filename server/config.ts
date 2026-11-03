import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(4180),
  APP_URL: z.string().url().default('http://localhost:4180'), STORE_NAME: z.string().default('订阅集 SubNest'),
  PRODSELLER_MODE: z.enum(['demo', 'live']).default('demo'), PRODSELLER_API_KEY: z.string().default(''),
  USDT_CNY_RATE: z.coerce.number().positive().max(100).default(7.2),
  MARKUP_PERCENT: z.coerce.number().min(0).max(1000).default(25),
  CATALOG_SYNC_MINUTES: z.coerce.number().int().min(5).max(1440).default(10),
  PAYMENT_MODE: z.enum(['demo', 'manual']).default('demo'),
  MANUAL_PAYMENT_INSTRUCTIONS: z.string().default(''),
  SUPPORT_EMAIL: z.string().default('support@example.com'),
  SUPPORT_WECHAT: z.string().default('support_wechat'),
  SUPPORT_TELEGRAM: z.string().default('t.me/support_contact'),
  AIPAY_GATEWAY_URL: z.string().url().default('https://openapi.alipay.com/gateway.do'),
  AIPAY_APP_ID: z.string().default(''),
  AIPAY_PUBLIC_KEY: z.string().default(''),
  AIPAY_PRIVATE_KEY: z.string().default(''),
  AIPAY_PRIVATE_PKCS_KEY: z.string().default(''),
  AIPAY_ALIPAY_PUBLIC_KEY: z.string().default(''),
  ADMIN_PASSWORD: z.string().min(16, '请先运行 npm run setup，或配置至少 16 位后台密码'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i, '需要 32 字节的十六进制加密密钥'),
  DATABASE_PATH: z.string().default('./data/store.sqlite'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'), TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env = process.env): Config {
  const c = schema.parse(env);
  if (c.PRODSELLER_MODE === 'live' && !c.PRODSELLER_API_KEY) throw new Error('真实模式必须配置 PRODSELLER_API_KEY');
  if (c.PRODSELLER_MODE === 'live' && c.PAYMENT_MODE === 'demo') throw new Error('真实供应商不允许演示付款');
  return c;
}
