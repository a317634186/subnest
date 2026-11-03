import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { X, Layers, ChevronRight, LoaderCircle } from 'lucide-react';
import { ApiError, statuses } from './api';

export const LanguageContext = createContext<{ lang: string; toggle: () => void; setLang: (next: 'zh' | 'en') => void }>({ lang: 'zh', toggle: () => {}, setLang: () => {} });
export function useLang() { const { lang, toggle, setLang } = useContext(LanguageContext); return { lang, toggle, setLang, t: (zh: string, en: string) => lang === 'zh' ? zh : en }; }
export function errorText(error: unknown, lang: string) {
  if (lang === 'zh') return error instanceof Error ? error.message : '请求失败，请稍后再试';
  const messages: Record<string, string> = {
    ORDER_NOT_FOUND: 'Order not found or recovery key is incorrect.', OUT_OF_STOCK: 'This product is out of stock.', PRICE_CHANGED: 'The price has changed. Refresh and try again.',
    INVALID_PASSWORD: 'Incorrect password.', LOGIN_REQUIRED: 'Please sign in again.', RATE_LIMITED: 'Too many requests. Please try again later.',
    PAYMENT_UNAVAILABLE: 'This payment method is not available.', ACTIVATION_EMAILS_REQUIRED: 'Enter one activation email for each unit.',
    VALIDATION_ERROR: 'Please check required fields, email addresses and amounts.', CHECKOUT_CONFLICT: 'Checkout details changed. Please start a new order.',
    SUPPLIER_AUTH: 'The API key is invalid or disabled. Check ProdSeller API Manager.', SUPPLIER_BUSY: 'A supplier connection is already in progress. Please try again.',
    DEMO_DISABLED: 'Demo payment is unavailable.', DEMO_PRODUCT: 'Demo products cannot accept real payments.',
  };
  return error instanceof ApiError ? messages[error.code] ?? 'The request could not be completed. Please try again or contact the store.' : 'Connection failed. Please try again.';
}
export function Brand({ name = false }: { name?: boolean }) { return <a className="brand" href="#"><span className="brand-logo"><Layers size={23}/></span>{name && <span>订阅集 <small>SubNest</small></span>}</a>; }

function matchBrandFromText(n: string): string | null {
  if (/\botp\b|verification\s*number/.test(n)) return 'otp';
  if (/apple\s*(id|tv|music|one|arcade)|icloud/.test(n)) return 'apple';
  if (/claude|anthropic/.test(n)) return 'claude';
  if (/codex/.test(n)) return 'codex';
  if (/chatgpt|openai|\bgpt\b/.test(n)) return 'chatgpt';
  if (/gemini|google\s*ai/.test(n)) return 'gemini';
  if (/grok|xai/.test(n)) return 'grok';
  if (/deepseek/.test(n)) return 'deepseek';
  if (/cursor/.test(n)) return 'cursor';
  if (/perplexity/.test(n)) return 'perplexity';
  if (/elevenlabs/.test(n)) return 'elevenlabs';
  if (/minimax/.test(n)) return 'minimax';
  if (/suno/.test(n)) return 'suno';
  if (/kling/.test(n)) return 'kling';
  if (/heygen/.test(n)) return 'heygen';
  if (/runway|seedance/.test(n)) return 'runway';
  if (/lovable|bolt\.new/.test(n)) return 'lovable';
  if (/muse/.test(n)) return 'muse';
  if (/vibi/.test(n)) return 'vibi';
  if (/qwen/.test(n)) return 'qwen';
  if (/kimi/.test(n)) return 'kimi';
  if (/midjourney|leonardo|openart|dreamina|higgsfield/.test(n)) return 'midjourney';
  if (/canva/.test(n)) return 'canva';
  if (/capcut|supercut/.test(n)) return 'capcut';
  if (/adobe|photoshop|illustrator|premiere|lightroom/.test(n)) return 'adobe';
  if (/figma/.test(n)) return 'figma';
  if (/freepik|magnific/.test(n)) return 'freepik';
  if (/wink\b/.test(n)) return 'wink';
  if (/xingtu/.test(n)) return 'xingtu';
  if (/photoroom/.test(n)) return 'photoroom';
  if (/meitu|beautycam/.test(n)) return 'meitu';
  if (/autodesk|autocad|maya|revit|3ds/.test(n)) return 'autodesk';
  if (/netflix/.test(n)) return 'netflix';
  if (/spotify/.test(n)) return 'spotify';
  if (/brain\.fm/.test(n)) return 'brainfm';
  if (/youtube|vidiq/.test(n)) return 'youtube';
  if (/disney/.test(n)) return 'disney';
  if (/tiktok/.test(n)) return 'tiktok';
  if (/iqiyi/.test(n)) return 'iqiyi';
  if (/youku/.test(n)) return 'youku';
  if (/amazon|prime/.test(n)) return 'amazon';
  if (/gmail/.test(n)) return 'gmail';
  if (/hotmail|outlook|emails\b|\bmail\b/.test(n)) return 'outlook';
  if (/\botp\b|verification/.test(n)) return 'otp';
  if (/telegram|telecampaign/.test(n)) return 'telegram';
  if (/discord/.test(n)) return 'discord';
  if (/facebook/.test(n)) return 'facebook';
  if (/\bx\s+(premium|account|blue)|twitter/.test(n)) return 'x';
  if (/apple|icloud/.test(n)) return 'apple';
  if (/google/.test(n)) return 'google';
  if (/notion/.test(n)) return 'notion';
  if (/microsoft|office/.test(n)) return 'office';
  if (/windows/.test(n)) return 'windows';
  if (/zoom/.test(n)) return 'zoom';
  if (/nordvpn|\bnord\b/.test(n)) return 'nordvpn';
  if (/expressvpn/.test(n)) return 'expressvpn';
  if (/surfshark/.test(n)) return 'surfshark';
  if (/avira/.test(n)) return 'avira';
  if (/kaspersky/.test(n)) return 'kaspersky';
  if (/norton/.test(n)) return 'norton';
  if (/proton/.test(n)) return 'proton';
  if (/adguard/.test(n)) return 'adguard';
  if (/hma\b/.test(n)) return 'hma';
  if (/ipvanish|purevpn|v2ray|proxy/.test(n)) return 'vpn';
  if (/gpm/.test(n)) return 'gpm';
  if (/duolingo|memrise/.test(n)) return 'duolingo';
  if (/\bedx\b/.test(n)) return 'edx';
  if (/coursera|udemy|skillshare/.test(n)) return 'coursera';
  if (/quizlet|kahoot/.test(n)) return 'quizlet';
  if (/ilovepdf/.test(n)) return 'ilovepdf';
  if (/scribd/.test(n)) return 'scribd';
  if (/grammarly|descript/.test(n)) return 'grammarly';
  if (/gamma/.test(n)) return 'gamma';
  if (/jetbrains/.test(n)) return 'jetbrains';
  if (/replit/.test(n)) return 'replit';
  if (/supabase/.test(n)) return 'supabase';
  if (/n8n/.test(n)) return 'n8n';
  if (/pixel/.test(n)) return 'pixel';
  if (/sheerid/.test(n)) return 'sheerid';
  if (/steam|game|xbox|freefire/.test(n)) return 'gaming';
  return null;
}

function inferBrandKey(brand: string, name?: string): string {
  const b = (brand || '').toLowerCase();
  if (b && b !== 'generic' && b !== 'ai' && b !== 'dev' && b !== 'vpn' && b !== 'vieon' && b !== 'meitu' && b !== 'framer' && b !== 'coursera' && b !== 'grammarly') {
    return b;
  }
  const raw = (name || '').trim();
  if (!raw) return b || 'generic';
  const primary = (raw.split(/\s*[–—]\s*|\s+-\s+/)[0] || raw).toLowerCase();
  return matchBrandFromText(primary) || matchBrandFromText(raw.toLowerCase()) || b || 'generic';
}

function extractMonogram(name?: string): { text: string; bg: string; fg: string } {
  const cleaned = (name || '')
    .replace(/^(\[[^\]]+\]|\([^)]+\)|[0-9$¥€£.,+\-—–/\s]|API\b|KEY\b|ACCOUNT\b)+/gi, '')
    .trim();
  const token = cleaned.split(/[\s\-—–(/+,.:]+/).find(Boolean) || 'SN';
  const cjk = token.match(/[\u4e00-\u9fa5]/);
  const text = cjk ? cjk[0]! : token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'AI';
  const palettes: [string, string][] = [
    ['#eef2ff', '#4338ca'],
    ['#ecfdf5', '#047857'],
    ['#fff1f2', '#be123c'],
    ['#fff7ed', '#c2410c'],
    ['#f5f3ff', '#6d28d9'],
    ['#ecfeff', '#0e7490'],
    ['#fefce8', '#a16207'],
  ];
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  const [bg, fg] = palettes[hash % palettes.length]!;
  return { text, bg, fg };
}

const brandPalettes: Record<string, { bg: string; fg: string }> = {
  claude: { bg: '#fdf0ea', fg: '#d97757' },
  chatgpt: { bg: '#e6f7f2', fg: '#10a37f' },
  codex: { bg: '#eef2ff', fg: '#312e81' },
  gemini: { bg: 'linear-gradient(135deg,#e8f0fe,#f3e8fd)', fg: '#4f46e5' },
  google: { bg: '#f1f6fe', fg: '#4285f4' },
  grok: { bg: '#18181b', fg: '#ffffff' },
  deepseek: { bg: '#eef2ff', fg: '#4d6bfe' },
  cursor: { bg: '#f1f5f9', fg: '#0f172a' },
  perplexity: { bg: '#ecfeff', fg: '#0891b2' },
  elevenlabs: { bg: '#f4f4f5', fg: '#18181b' },
  minimax: { bg: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', fg: '#e11d48' },
  suno: { bg: 'linear-gradient(135deg,#fff7ed,#ffedd5)', fg: '#ea580c' },
  kling: { bg: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', fg: '#7c3aed' },
  heygen: { bg: '#eef2ff', fg: '#4f46e5' },
  runway: { bg: '#f3f4f6', fg: '#111827' },
  lovable: { bg: 'linear-gradient(135deg,#fff1f2,#ffedd5)', fg: '#f43f5e' },
  muse: { bg: 'linear-gradient(135deg,#faf5ff,#fce7f3)', fg: '#9333ea' },
  vibi: { bg: 'linear-gradient(135deg,#ecfeff,#e0f2fe)', fg: '#0284c7' },
  qwen: { bg: '#eef2ff', fg: '#4f46e5' },
  kimi: { bg: '#eff6ff', fg: '#1d4ed8' },
  midjourney: { bg: '#eef2ff', fg: '#312e81' },
  canva: { bg: 'linear-gradient(135deg,#e0fbfc,#ede9fe)', fg: '#0099a8' },
  capcut: { bg: '#18181b', fg: '#ffffff' },
  adobe: { bg: '#fef2f2', fg: '#eb1000' },
  figma: { bg: '#f8fafc', fg: '#f24e1e' },
  framer: { bg: '#eff6ff', fg: '#0055ff' },
  freepik: { bg: '#eff6ff', fg: '#1264ff' },
  meitu: { bg: 'linear-gradient(135deg,#fff1f2,#fce7f3)', fg: '#db2777' },
  wink: { bg: 'linear-gradient(135deg,#fdf2f8,#f3e8ff)', fg: '#c026d3' },
  xingtu: { bg: '#fff1f2', fg: '#e11d48' },
  photoroom: { bg: '#f5f3ff', fg: '#6d28d9' },
  autodesk: { bg: '#f0fdfa', fg: '#0696d7' },
  netflix: { bg: '#fef0f0', fg: '#e50914' },
  spotify: { bg: '#eaf7ed', fg: '#1db954' },
  brainfm: { bg: '#fff7ed', fg: '#ea580c' },
  youtube: { bg: '#fff0f0', fg: '#ff0000' },
  disney: { bg: '#eef0fc', fg: '#113ccf' },
  tiktok: { bg: '#18181b', fg: '#25f4ee' },
  iqiyi: { bg: '#ecfdf5', fg: '#00be06' },
  youku: { bg: '#eff6ff', fg: '#0093ff' },
  vieon: { bg: '#ecfdf5', fg: '#059669' },
  amazon: { bg: '#fffbeb', fg: '#d97706' },
  gmail: { bg: '#fef2f2', fg: '#ea4335' },
  outlook: { bg: '#eff6ff', fg: '#0078d4' },
  otp: { bg: '#ecfdf5', fg: '#059669' },
  telegram: { bg: '#e0f2fe', fg: '#229ed9' },
  discord: { bg: '#eef2ff', fg: '#5865f2' },
  facebook: { bg: '#eff6ff', fg: '#1877f2' },
  x: { bg: '#18181b', fg: '#ffffff' },
  apple: { bg: '#f4f4f5', fg: '#18181b' },
  office: { bg: '#fff7ed', fg: '#ea580c' },
  windows: { bg: '#eff6ff', fg: '#0078d4' },
  notion: { bg: '#f4f4f0', fg: '#191919' },
  zoom: { bg: '#eff6ff', fg: '#2d8cff' },
  nordvpn: { bg: '#eff6ff', fg: '#4687ff' },
  expressvpn: { bg: '#fef2f2', fg: '#da3940' },
  surfshark: { bg: '#f0fdfa', fg: '#178a9e' },
  kaspersky: { bg: '#ecfdf5', fg: '#00a88e' },
  avira: { bg: '#fff1f2', fg: '#d71920' },
  norton: { bg: '#fff7ed', fg: '#ffcb00' },
  proton: { bg: '#f5f3ff', fg: '#6d4aff' },
  adguard: { bg: '#ecfdf5', fg: '#10b981' },
  hma: { bg: '#fffbeb', fg: '#d97706' },
  vpn: { bg: '#ecfeff', fg: '#0891b2' },
  gpm: { bg: '#fff7ed', fg: '#ea580c' },
  duolingo: { bg: '#f0fdf4', fg: '#58cc02' },
  coursera: { bg: '#eff6ff', fg: '#0056d2' },
  edx: { bg: '#fff1f2', fg: '#b31b1b' },
  quizlet: { bg: '#eef2ff', fg: '#4255ff' },
  ilovepdf: { bg: '#fef2f2', fg: '#e5322d' },
  scribd: { bg: '#f0fdfa', fg: '#0d9488' },
  grammarly: { bg: '#ecfdf5', fg: '#15c39a' },
  gamma: { bg: 'linear-gradient(135deg,#f5f3ff,#fce7f3)', fg: '#7c3aed' },
  jetbrains: { bg: '#18181b', fg: '#fb7185' },
  replit: { bg: '#fff7ed', fg: '#f26207' },
  supabase: { bg: '#ecfdf5', fg: '#10b981' },
  n8n: { bg: '#fff1f2', fg: '#ea4b71' },
  dev: { bg: '#f0fdf4', fg: '#059669' },
  pixel: { bg: '#eff6ff', fg: '#1a73e8' },
  sheerid: { bg: '#eef2ff', fg: '#4f46e5' },
  gaming: { bg: '#f5f3ff', fg: '#7c3aed' },
};

function renderBrandSvg(key: string, name?: string): ReactNode {
  switch (key) {
    case 'claude':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7M7.8 3.4l8.4 17.2M3.4 16.2l17.2-8.4M3.4 7.8l17.2 8.4M16.2 3.4L7.8 20.6"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/></svg>;
    case 'chatgpt':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2a4.4 4.4 0 0 1 4.1 2.8 4.4 4.4 0 0 1 3.7 6.5 4.4 4.4 0 0 1-1.9 6 4.4 4.4 0 0 1-5.9 2.3 4.4 4.4 0 0 1-4.1-2.8 4.4 4.4 0 0 1-3.7-6.5 4.4 4.4 0 0 1 1.9-6A4.4 4.4 0 0 1 12 3.2Z"/><polygon points="12,8.2 15.3,10.1 15.3,13.9 12,15.8 8.7,13.9 8.7,10.1"/></svg>;
    case 'codex':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="m8 9.5 3 2.5-3 2.5M13 14.5h3.5"/></svg>;
    case 'gemini':
      return <svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="gem-g" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stopColor="#4285F4"/><stop offset="0.5" stopColor="#9B72CB"/><stop offset="1" stopColor="#D96570"/></linearGradient></defs><path d="M12 2C12 7.5 16.5 12 22 12C16.5 12 12 16.5 12 22C12 16.5 7.5 12 2 12C7.5 12 12 7.5 12 2Z" fill="url(#gem-g)"/></svg>;
    case 'google':
      return <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.81-1.5 3.34-3.2 4.37v3.62h5.18c3.03-2.79 4.78-6.9 4.78-11.82 0-.8-.08-1.57-.22-2.3H21.35z"/><path fill="#34A853" d="M12.18 22c2.7 0 4.96-.9 6.62-2.42l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.23v2.6C4.88 19.78 8.26 22 12.18 22z"/><path fill="#FBBC05" d="M6.57 13.91a6.02 6.02 0 0 1 0-3.82v-2.6H3.23a10.01 10.01 0 0 0 0 9.02l3.34-2.6z"/><path fill="#EA4335" d="M12.18 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C17.13 2.98 14.88 2 12.18 2 8.26 2 4.88 4.22 3.23 7.49l3.34 2.6c.79-2.37 3-4.13 5.61-4.13z"/></svg>;
    case 'grok':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 18.5 18.5 5.5"/><path d="M9.5 6.5a6.5 6.5 0 1 0 8 8"/></svg>;
    case 'deepseek':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 13.2c0-4.3 3.6-7.7 8.2-7.7 3.5 0 6.5 2 7.7 4.9.6-.4 1.4-.6 2.1-.4-.6 1.5-1.8 2.5-3.3 2.8-.7 3.4-3.8 5.9-7.5 5.9-1.8 0-3.5-.6-4.8-1.6l-3.4 1.1 1.2-3.1c-.1-.6-.2-1.2-.2-1.9Zm9.8-2.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"/></svg>;
    case 'cursor':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Zm-.8 5.3 1.7 9 1.8-3.4 3.4-1.8-6.9-3.8Z"/></svg>;
    case 'perplexity':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9M7.5 4.5v15M16.5 4.5v15"/></svg>;
    case 'elevenlabs':
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="4" width="3.6" height="16" rx="1.2"/><rect x="13.4" y="4" width="3.6" height="16" rx="1.2"/></svg>;
    case 'minimax':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 17V7l4.3 5.5L12 7l4.2 5.5L20.5 7v10"/></svg>;
    case 'suno':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 4a8 8 0 0 1 8 8"/></svg>;
    case 'kling':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3.5"/><polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none"/></svg>;
    case 'heygen':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.5A1.5 1.5 0 0 1 7.3 4.2l11.5 6.5a1.5 1.5 0 0 1 0 2.6L7.3 19.8A1.5 1.5 0 0 1 5 18.5v-13Z"/></svg>;
    case 'runway':
      return <b className="logo-monogram">R</b>;
    case 'lovable':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.4 4.9 13.5a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 0 1 6.8 6.8L12 20.4Z"/></svg>;
    case 'muse':
      return <b className="logo-monogram">M✦</b>;
    case 'vibi':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/></svg>;
    case 'qwen':
      return <b className="logo-monogram">Q</b>;
    case 'kimi':
      return <b className="logo-monogram">K☾</b>;
    case 'midjourney':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12H5l7-12Zm0 3 6 9h-6"/><path d="M4 19c2.5 1 5.5 1 8 0s5.5-1 8 0"/></svg>;
    case 'canva':
      return <i>C</i>;
    case 'capcut':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.5 20 16.5M20 7.5 4 16.5"/><rect x="3.5" y="4.5" width="17" height="15" rx="3" strokeWidth="1.7"/></svg>;
    case 'adobe':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.8 4H21v16l-7.2-16Zm-3.6 0H3v16L10.2 4ZM12 9.9l4.6 10.1h-3.1l-1.3-3.2H9.3L12 9.9Z"/></svg>;
    case 'figma':
      return <svg viewBox="0 0 24 24"><path fill="#F24E1E" d="M8.5 3h3.5v5.5H8.5a2.75 2.75 0 1 1 0-5.5z"/><path fill="#FF7262" d="M12 3h3.5a2.75 2.75 0 1 1 0 5.5H12V3z"/><path fill="#A259FF" d="M8.5 8.5H12V14H8.5a2.75 2.75 0 1 1 0-5.5z"/><path fill="#1ABCFE" d="M14.75 14a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5z"/><path fill="#0ACF83" d="M8.5 14H12v2.75a2.75 2.75 0 1 1-2.75-2.75H8.5z"/></svg>;
    case 'framer':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h14v6h-7L5 3Zm0 6h7l7 6H5V9Zm0 6h7v6l-7-6Z"/></svg>;
    case 'freepik':
      return <b className="logo-monogram">FP</b>;
    case 'wink':
      return <b className="logo-monogram">W✦</b>;
    case 'xingtu':
      return <b className="logo-monogram">醒</b>;
    case 'photoroom':
      return <b className="logo-monogram">PR</b>;
    case 'meitu':
      return <b className="logo-monogram">MT</b>;
    case 'autodesk':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19 11.5 4h1.5L20 19M7 14h10"/></svg>;
    case 'netflix':
      return <b>N</b>;
    case 'spotify':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.85.2c-2.33-1.42-5.26-1.74-8.71-.95a.6.6 0 1 1-.27-1.17c3.78-.86 7.03-.49 9.63 1.1a.6.6 0 0 1 .2.82Zm1.22-2.72a.75.75 0 0 1-1.03.25c-2.67-1.64-6.73-2.11-9.88-1.16a.75.75 0 1 1-.43-1.44c3.6-1.09 8.08-.56 11.1 1.3a.75.75 0 0 1 .24 1.05Zm.11-2.83C14.73 8.95 9.45 8.77 6.4 9.7a.9.9 0 1 1-.52-1.72c3.5-1.06 9.33-.86 13.02 1.33a.9.9 0 0 1-.97 1.54Z"/></svg>;
    case 'brainfm':
      return <b className="logo-monogram">BF</b>;
    case 'youtube':
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="2.5" y="5" width="19" height="14" rx="4"/><polygon points="10,9 16,12 10,15" fill="#fff"/></svg>;
    case 'disney':
      return <b>D<span>+</span></b>;
    case 'tiktok':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 3h-2.8v11.6a2.6 2.6 0 1 1-1.8-2.5V9.2a5.4 5.4 0 1 0 4.6 5.3V8.7c1 .8 2.3 1.3 3.7 1.3V7.2c-2-.1-3.7-1.9-3.7-4.2Z"/></svg>;
    case 'iqiyi':
      return <b className="logo-monogram">iQ</b>;
    case 'youku':
      return <b className="logo-monogram">YK</b>;
    case 'vieon':
      return <b className="logo-monogram">TV</b>;
    case 'amazon':
      return <b className="logo-monogram">a↷</b>;
    case 'gmail':
      return <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 13.2 3.5 6.8V5.5A1.5 1.5 0 0 1 6 4.3l6 4.5 6-4.5a1.5 1.5 0 0 1 2.5 1.2v1.3L12 13.2z"/><path fill="#4285F4" d="M3.5 6.8 7 9.4v9.6H5A1.5 1.5 0 0 1 3.5 17.5V6.8z"/><path fill="#34A853" d="M17 9.4l3.5-2.6v10.7A1.5 1.5 0 0 1 19 19h-2V9.4z"/><path fill="#FBBC05" d="M7 9.4 12 13.2l5-3.8v9.6H7V9.4z" opacity=".2"/></svg>;
    case 'outlook':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6 8.5-6"/></svg>;
    case 'otp':
      return <b className="logo-monogram">2FA</b>;
    case 'telegram':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.7 4.4 3.4 11.1c-1.1.4-1.1 1.1-.2 1.4l4.4 1.4 10.2-6.4c.5-.3.9-.1.5.2l-8.3 7.5-.3 4.5c.4 0 .6-.2.9-.4l2.1-2.1 4.4 3.3c.8.4 1.4.2 1.6-.8l2.9-13.8c.3-1.2-.5-1.7-1.9-1.5Z"/></svg>;
    case 'discord':
      return <b className="logo-monogram">DC</b>;
    case 'facebook':
      return <b className="logo-monogram">f</b>;
    case 'x':
      return <b className="logo-monogram">𝕏</b>;
    case 'apple':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.2 1 8.3.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.1-.8-2.1-3.4ZM14.4 6.4c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2Z"/></svg>;
    case 'office':
      return <svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7.8" height="7.8" rx="1" fill="#F25022"/><rect x="12.7" y="3.5" width="7.8" height="7.8" rx="1" fill="#7FBA00"/><rect x="3.5" y="12.7" width="7.8" height="7.8" rx="1" fill="#00A4EF"/><rect x="12.7" y="12.7" width="7.8" height="7.8" rx="1" fill="#FFB900"/></svg>;
    case 'windows':
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="3.5" width="7.8" height="7.8" rx="1"/><rect x="12.7" y="3.5" width="7.8" height="7.8" rx="1"/><rect x="3.5" y="12.7" width="7.8" height="7.8" rx="1"/><rect x="12.7" y="12.7" width="7.8" height="7.8" rx="1"/></svg>;
    case 'notion':
      return <b>N</b>;
    case 'zoom':
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><polygon points="16.5,10 21,7.5 21,16.5 16.5,14"/></svg>;
    case 'nordvpn':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0-7.5 14l3.5-5.7 2.2 3.3L13 9.8l3.2 5.2 1.2-1.8L19.5 17A9 9 0 0 0 12 3Z"/></svg>;
    case 'expressvpn':
      return <b className="logo-monogram">EX</b>;
    case 'surfshark':
      return <b className="logo-monogram">SS</b>;
    case 'kaspersky':
      return <b className="logo-monogram">K</b>;
    case 'avira':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 13a8.5 8.5 0 0 1 17 0H3.5Z"/><path d="M12 5v13.5m0-5.5c0 3.2 1.7 5.5 4.6 6.5"/></svg>;
    case 'norton':
      return <b className="logo-monogram">N</b>;
    case 'proton':
      return <b className="logo-monogram">P</b>;
    case 'adguard':
      return <b className="logo-monogram">AG</b>;
    case 'hma':
      return <b className="logo-monogram">HMA</b>;
    case 'vpn':
      return <b className="logo-monogram">VPN</b>;
    case 'gpm':
      return <b className="logo-monogram">GPM</b>;
    case 'duolingo':
      return <b className="logo-monogram">🦉</b>;
    case 'coursera':
      return <b className="logo-monogram">C</b>;
    case 'edx':
      return <b className="logo-monogram">edX</b>;
    case 'quizlet':
      return <b className="logo-monogram">Q</b>;
    case 'ilovepdf':
      return <b className="logo-monogram">PDF</b>;
    case 'scribd':
      return <b className="logo-monogram">S</b>;
    case 'grammarly':
      return <b className="logo-monogram">G</b>;
    case 'gamma':
      return <b className="logo-monogram">Γ</b>;
    case 'jetbrains':
      return <b className="logo-monogram">JB</b>;
    case 'replit':
      return <b className="logo-monogram">RP</b>;
    case 'supabase':
      return <b className="logo-monogram">SB</b>;
    case 'n8n':
      return <b className="logo-monogram">n8n</b>;
    case 'pixel':
      return <b className="logo-monogram">PX</b>;
    case 'sheerid':
      return <b className="logo-monogram">ID✓</b>;
    case 'gaming':
      return <b className="logo-monogram">🎮</b>;
    default: {
      const m = extractMonogram(name);
      return <b className="logo-monogram">{m.text}</b>;
    }
  }
}

export function ProductIcon({ brand, name, small = false }: { brand: string; name?: string; small?: boolean }) {
  const key = inferBrandKey(brand, name);
  const palette = brandPalettes[key];
  const fallback = !palette ? extractMonogram(name) : undefined;
  const style: CSSProperties | undefined = palette
    ? { background: palette.bg, color: palette.fg, opacity: 1 }
    : fallback
      ? { background: fallback.bg, color: fallback.fg, opacity: 1 }
      : undefined;
  return (
    <span className={`product-icon ${key} ${small ? 'small' : ''}`} style={style} aria-hidden="true">
      {renderBrandSvg(key, name)}
    </span>
  );
}
export function Status({ status }: { status: string }) { const { t } = useLang(); return <span className={`status ${status}`}>{t(...(statuses[status] ?? [status, status]))}</span>; }
export function Spinner() { return <LoaderCircle className="spin" size={18}/>; }
export function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><Layers size={30}/><h3>{title}</h3><p>{text}</p></div>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const { t } = useLang();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,a[href]') ?? [])];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('关闭','Close')}><X size={21}/></button></div>{children}</div></div>;
}
export function ArrowLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-button" onClick={onClick}>{children}<ChevronRight size={16}/></button>; }
