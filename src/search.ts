import type { Product } from './api';

const BRAND_ALIASES: Record<string, string[]> = {
  chatgpt: ['chatgpt', 'chat gpt', 'openai', 'gpt', 'gpt4', 'gpt-4', 'gpt5', 'gpt-5', 'o1', 'o3'],
  claude: ['claude', 'anthropic', '克劳德', 'opus', 'sonnet', 'haiku'],
  codex: ['codex', 'openai codex'],
  gemini: ['gemini', 'google ai', 'google one', '双子座', '谷歌ai'],
  grok: ['grok', 'supergrok', 'super grok', 'xai', '马斯克'],
  deepseek: ['deepseek', 'deep seek', '深度求索'],
  cursor: ['cursor', 'ai编程', '代码编辑器'],
  perplexity: ['perplexity', 'pplx', 'ai搜索'],
  elevenlabs: ['elevenlabs', 'eleven labs', '11labs', 'ai配音', '语音合成'],
  minimax: ['minimax', 'mini max', '海螺', '海螺ai'],
  suno: ['suno', 'ai音乐', 'ai写歌'],
  kling: ['kling', '可灵', '快手可灵'],
  heygen: ['heygen', 'hey gen', '数字人'],
  runway: ['runway', 'seedance', 'ai视频'],
  lovable: ['lovable', 'bolt', 'bolt.new'],
  muse: ['muse', 'muse ai'],
  vibi: ['vibi', 'vibi.pro', 'vibi.top'],
  qwen: ['qwen', '通义', '通义千问', '千问'],
  kimi: ['kimi', '月之暗面'],
  midjourney: ['midjourney', 'mid journey', 'mj', 'leonardo', 'openart', 'dreamina', '即梦', 'higgsfield', 'ai绘画', 'ai生图'],
  canva: ['canva', '可画'],
  capcut: ['capcut', 'cap cut', 'supercut', '剪映', '剪映国际版', '视频剪辑'],
  adobe: ['adobe', 'photoshop', 'ps', 'illustrator', 'premiere', 'lightroom', 'creative cloud', '创意云', '全家桶'],
  figma: ['figma'],
  framer: ['framer'],
  freepik: ['freepik', 'magnific'],
  meitu: ['meitu', '美图', '美图秀秀', 'beautycam', 'wink', 'xingtu', '醒图', 'photoroom', '修图'],
  autodesk: ['autodesk', 'autocad', 'cad', 'maya', 'revit', '3ds', '3dsmax', 'fusion', '建模'],
  netflix: ['netflix', '奈飞', '网飞'],
  spotify: ['spotify', '声破天', '音乐会员'],
  youtube: ['youtube', 'you tube', 'ytb', '油管'],
  disney: ['disney', 'disney+', '迪士尼'],
  tiktok: ['tiktok', 'tik tok', 'tk', '抖音', '海外抖音'],
  iqiyi: ['iqiyi', '爱奇艺'],
  youku: ['youku', '优酷'],
  vieon: ['vieon'],
  prime: ['prime video', 'amazon prime', 'amazon', '亚马逊'],
  gmail: ['gmail', 'google mail', '谷歌邮箱'],
  outlook: ['outlook', 'hotmail', '微软邮箱'],
  otp: ['otp', '接码', '验证码'],
  telegram: ['telegram', 'tg', '电报', '纸飞机'],
  discord: ['discord', 'dc', 'nitro'],
  facebook: ['facebook', 'fb', '脸书'],
  x: ['twitter', '推特'],
  apple: ['apple', 'apple tv', 'apple music', 'apple id', 'icloud', '苹果', '美区id'],
  office: ['microsoft 365', 'office 365', 'microsoft office', 'office', '微软', 'word', 'excel', 'powerpoint', 'ppt'],
  windows: ['windows', 'win10', 'win11', '系统激活'],
  notion: ['notion', '笔记'],
  zoom: ['zoom', '视频会议'],
  nordvpn: ['nordvpn', 'nord vpn', 'vpn', '梯子', '节点', '加速器', '科学上网'],
  expressvpn: ['expressvpn', 'express vpn', 'vpn', '梯子', '节点', '加速器', '科学上网'],
  surfshark: ['surfshark', 'surfshark vpn', 'vpn', '梯子', '节点', '加速器', '科学上网'],
  proton: ['proton', 'protonvpn', 'proton vpn', 'vpn', '梯子', '节点', '加速器'],
  vpn: ['vpn', 'hma', 'adguard', 'ipvanish', 'purevpn', 'avira', 'norton', 'v2ray', 'proxy', '梯子', '节点', '加速器', '科学上网', '代理'],
  kaspersky: ['kaspersky', '卡巴斯基', '杀毒'],
  gpm: ['gpm', 'gpmlogin', '指纹浏览器'],
  duolingo: ['duolingo', '多邻国', 'memrise', '学英语', '学外语'],
  coursera: ['coursera', 'edx', 'udemy', 'skillshare', '网课'],
  quizlet: ['quizlet', 'kahoot'],
  grammarly: ['grammarly', 'scribd', 'ilovepdf', 'pdf', '语法检查'],
  gamma: ['gamma', 'ai ppt'],
  dev: ['jetbrains', 'intellij', 'pycharm', 'webstorm', 'replit', 'warp', 'github', 'supabase', 'n8n'],
  pixel: ['pixel', 'google pixel'],
  sheerid: ['sheerid', 'sheer id', '学生认证', '资格认证', '教育认证'],
  gaming: ['steam', 'xbox', 'freefire', '游戏', '钻石'],
};

const QUERY_TO_BRANDS = new Map<string, Set<string>>();
for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
  for (const alias of aliases) {
    const key = alias.toLowerCase().trim();
    const compact = key.replace(/\s+/g, '');
    for (const k of [key, compact]) {
      if (!QUERY_TO_BRANDS.has(k)) QUERY_TO_BRANDS.set(k, new Set());
      QUERY_TO_BRANDS.get(k)!.add(brand);
    }
  }
}

export interface IndexedProduct {
  p: Product;
  primaryTitle: string;
  primaryCompact: string;
  fullTitle: string;
  fullCompact: string;
  aliasText: string;
  providerText: string;
  descText: string;
}

export function buildSearchIndex(products: Product[]): IndexedProduct[] {
  return products.map(p => {
    const nameZh = (p.name || '').toLowerCase();
    const nameEn = (p.nameEn || '').toLowerCase();
    // Main product subject is the part before "–", " - ", or "("
    const primaryZh = nameZh.split(/\s*[–—]\s*|\s+-\s+/)[0] || nameZh;
    const primaryEn = nameEn.split(/\s*[–—]\s*|\s+-\s+/)[0] || nameEn;
    const primaryTitle = `${primaryZh} ${primaryEn}`;
    const primaryCompact = primaryTitle.replace(/[\s\-_./]+/g, '');
    const fullTitle = `${nameZh} ${nameEn}`;
    const fullCompact = fullTitle.replace(/[\s\-_./]+/g, '');
    const brandKey = (p.brand || '').toLowerCase();
    const aliases = BRAND_ALIASES[brandKey] ?? [];
    const aliasText = `${brandKey} ${aliases.join(' ')}`.toLowerCase();
    const providerText = `${p.providerName ?? ''} ${p.provider ?? ''}`.toLowerCase();
    const descText = `${p.description || ''} ${p.descriptionEn || ''}`.toLowerCase();
    return { p, primaryTitle, primaryCompact, fullTitle, fullCompact, aliasText, providerText, descText };
  });
}

function scoreSingleToken(item: IndexedProduct, token: string, compactToken: string): { titleScore: number; descScore: number } {
  let titleScore = 0;
  const targetBrands = QUERY_TO_BRANDS.get(token) ?? QUERY_TO_BRANDS.get(compactToken);
  const itemBrand = (item.p.brand || '').toLowerCase();

  // 1. Exact brand match
  if (targetBrands && targetBrands.has(itemBrand)) {
    titleScore += 900;
    if (itemBrand && item.primaryTitle.includes(itemBrand)) {
      titleScore += 300;
    }
  }

  // 2. Primary title match (before the dash "–")
  if (item.primaryTitle.includes(token) || (compactToken.length >= 2 && item.primaryCompact.includes(compactToken))) {
    titleScore += item.primaryTitle.startsWith(token) || item.primaryCompact.startsWith(compactToken) ? 700 : 500;
  } else if (item.fullTitle.includes(token) || (compactToken.length >= 2 && item.fullCompact.includes(compactToken))) {
    // 3. Secondary / qualifier title match (after the dash "–")
    titleScore += targetBrands ? 80 : 400;
  } else if (item.aliasText.includes(token) || item.providerText.includes(token)) {
    // 4. Brand alias or provider match
    titleScore += 250;
  }

  const descScore = titleScore === 0 && item.descText.includes(token) ? 15 : 0;
  return { titleScore, descScore };
}

export function searchAndSortProducts(
  indexed: IndexedProduct[],
  options: {
    query: string;
    category?: string;
    provider?: string;
    sort?: string;
    stockFilter?: 'all' | 'in' | 'out';
    ignoreCategoryWhenSearching?: boolean;
  },
): Product[] {
  const rawQuery = (options.query || '').trim().toLowerCase();
  const category = options.category || 'all';
  const provider = options.provider || 'all';
  const sort = options.sort || 'default';
  const stockFilter = options.stockFilter || 'all';

  const candidates = indexed.filter(item => {
    if (provider !== 'all' && item.p.provider !== provider) return false;
    if (category !== 'all' && item.p.category !== category) return false;
    if (stockFilter === 'in' && !item.p.inStock) return false;
    if (stockFilter === 'out' && item.p.inStock) return false;
    return true;
  });

  if (!rawQuery) {
    const list = candidates.map(c => c.p);
    return list.sort((a, b) => {
      const stockDiff = Number(b.inStock) - Number(a.inStock);
      if (stockDiff !== 0) return stockDiff;
      if (sort === 'popular') return (b.soldCount ?? 0) - (a.soldCount ?? 0);
      if (sort === 'newest') return Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '');
      if (sort === 'low') return a.priceCents - b.priceCents;
      if (sort === 'high') return b.priceCents - a.priceCents;
      return 0;
    });
  }

  const runMatch = (pool: IndexedProduct[]) => {
    const compactWhole = rawQuery.replace(/\s+/g, '');
    const tokens = rawQuery.split(/\s+/).filter(Boolean);

    const titleMatches: Array<{ p: Product; score: number }> = [];
    const descFallbackMatches: Array<{ p: Product; score: number }> = [];

    for (const item of pool) {
      // Also check the whole query as a compact token (e.g. "chat gpt" -> "chatgpt")
      const whole = tokens.length > 1 ? scoreSingleToken(item, rawQuery, compactWhole) : { titleScore: 0, descScore: 0 };

      let allTokensInTitle = true;
      let allTokensStrong = true;
      let allTokensSomewhere = true;
      let tokenTitleSum = 0;
      let tokenDescSum = 0;

      for (const tk of tokens) {
        const ctk = tk.replace(/[\s\-_./]+/g, '');
        const { titleScore, descScore } = scoreSingleToken(item, tk, ctk);
        if (titleScore > 0) {
          tokenTitleSum += titleScore;
          if (titleScore < 200) allTokensStrong = false;
        } else if (descScore > 0) {
          allTokensInTitle = false;
          allTokensStrong = false;
          tokenDescSum += descScore;
        } else {
          allTokensInTitle = false;
          allTokensStrong = false;
          allTokensSomewhere = false;
          break;
        }
      }

      const bestTitleScore = Math.max(whole.titleScore, allTokensInTitle ? tokenTitleSum : 0);
      const isStrong = whole.titleScore >= 200 || (allTokensInTitle && allTokensStrong);
      if (bestTitleScore > 0) {
        titleMatches.push({ p: item.p, score: isStrong ? bestTitleScore : Math.min(bestTitleScore, 150) });
      } else if (whole.descScore > 0 || (allTokensSomewhere && tokenDescSum > 0)) {
        descFallbackMatches.push({ p: item.p, score: tokenTitleSum + tokenDescSum + whole.descScore });
      }
    }

    if (titleMatches.length > 0) {
      const strongMatches = titleMatches.filter(m => m.score >= 200);
      return strongMatches.length > 0 ? strongMatches : titleMatches;
    }
    return descFallbackMatches;
  };

  let scored = runMatch(candidates);
  // If user searched while a category filter was active and got 0 results in that category, fall back to all categories
  if (scored.length === 0 && category !== 'all' && options.ignoreCategoryWhenSearching !== false) {
    const allPool = indexed.filter(item => {
      if (provider !== 'all' && item.p.provider !== provider) return false;
      if (stockFilter === 'in' && !item.p.inStock) return false;
      if (stockFilter === 'out' && item.p.inStock) return false;
      return true;
    });
    scored = runMatch(allPool);
  }

  scored.sort((a, b) => {
    const stockDiff = Number(b.p.inStock) - Number(a.p.inStock);
    if (stockDiff !== 0) return stockDiff;
    if (sort === 'popular') return (b.p.soldCount ?? 0) - (a.p.soldCount ?? 0) || b.score - a.score;
    if (sort === 'newest') return Date.parse(b.p.updatedAt ?? '') - Date.parse(a.p.updatedAt ?? '') || b.score - a.score;
    if (sort === 'low') return a.p.priceCents - b.p.priceCents || b.score - a.score;
    if (sort === 'high') return b.p.priceCents - a.p.priceCents || b.score - a.score;
    return b.score - a.score;
  });

  return scored.map(s => s.p);
}
