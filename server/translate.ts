import { CURATED_BY_SOURCE_ID } from "./curated-translations.js";
const ZH_RE = /[\u4e00-\u9fa5]/;
const ZH_GLOBAL_RE = /[\u4e00-\u9fa5]/g;

export function hasChinese(text: string): boolean {
  return ZH_RE.test(text);
}

const ALLOWED_EN_BRANDS_RE = /\b(ChatGPT|OpenAI|Claude|Anthropic|Codex|Gemini|Google|Perplexity|Cursor|Midjourney|Canva|CapCut|Adobe|Figma|Framer|Spotify|Netflix|YouTube|Disney|TikTok|Telegram|Discord|Microsoft|Windows|Office|Notion|Zoom|NordVPN|ExpressVPN|Surfshark|Proton|Autodesk|AutoCAD|Revit|Maya|3ds\s*Max|Civil\s*3D|JetBrains|Grammarly|QuillBot|Duolingo|Coursera|Udemy|edX|LinkedIn|TradingView|Baeldung|Scribd|ElevenLabs|MiniMax|Suno|Kling|HeyGen|Runway|Seedance|Seedream|Lovable|Bolt|Muse|Vibi|Qwen|Kimi|DeepSeek|Grok|xAI|GLM|TeamSocLo|NxAPI|Kiro|Mirai|QuantumVault|ProdSeller|SheerID|Pixel|Gmail|Outlook|Hotmail|iCloud|Apple|Mac|macOS|Linux|Android|iOS|PC|TV|API|CLI|IDE|SDK|SSH|HTTP|SOCKS5|VPS|VLESS|Trojan|V2Ray|VPN|DNS|UID|URL|JSON|QR|CDK|OTP|2FA|VIP|Pro|Plus|Max|Ultra|Premium|Business|Team|Enterprise|Individual|Personal|Family|Student|Edu|Education|Lite|Basic|Standard|Advanced|Starter|Unlimited|Token|Tokens|Credits|Credit|Flow|Drive|Photos|Omni|Flash|Sonnet|Opus|Haiku|Fable|Astra|Sol|Luna|Terra|Nano|Banana|Antigravity|VS\s*Code|VSCode|Claude\s*Code|Roo\s*Code|Kilo\s*Code|OpenCode|Cline|Windsurf|9router|9Router|vibi\.top|vibi\.pro|gpt-[a-z0-9.\-]+|claude-[a-z0-9.\-]+|deepseek-[a-z0-9.\-]+|grok-[a-z0-9.\-]+|qwen[a-z0-9.\-]*|kimi-[a-z0-9.\-]+|glm-[a-z0-9.\-]+)\b/gi;

export function hasUntranslatedEnglishClauses(text: string): boolean {
  const stripped = (text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(ALLOWED_EN_BRANDS_RE, ' ');
  return /[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(stripped);
}

export function isMostlyChinese(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  if (hasUntranslatedEnglishClauses(trimmed)) return false;
  const zhMatches = trimmed.match(ZH_GLOBAL_RE);
  const zhCount = zhMatches ? zhMatches.length : 0;
  if (zhCount === 0) return false;
  const enWords = trimmed.replace(ZH_GLOBAL_RE, ' ').replace(ALLOWED_EN_BRANDS_RE, ' ').match(/[A-Za-z]{2,}/g)?.length ?? 0;
  return zhCount >= 4 && zhCount >= enWords * 0.45;
}

export function normalizeEnglishTitle(raw: string): string {
  let s = (raw || '').trim().replace(/\s+/g, ' ');
  const isCreditOrTokenTitle = /\b(credits?|tokens?|coins?|points?|voices?|vibi)\b/i.test(s);
  s = s
    .replace(/\[KEY\]/gi, '[Activation Key]')
    .replace(/\bFW\b/gi, '(Full Warranty)')
    .replace(/\bNW\b/gi, '(No Warranty)')
    .replace(/\bClaude\s+Dev\b/gi, 'Claude Code')
    .replace(/\b(\d+)\s*[-–]\s*(\d+)\s*D\b/gi, '$1–$2 Days')
    .replace(/\b(\d+)\s*D\b(?!\s*(?:render|model|print|audio|animation|video))/gi, '$1 Days');
  if (isCreditOrTokenTitle) {
    // In a Credits/Tokens product title, "– 1M," or "– 3M," means 1M/3M Credits, not Months
    s = s.replace(/(–\s*\d+)\s*M\b(?=\s*[,，(]|$)/gi, '$1M Credits');
  }
  s = s
    .replace(/\b(\d+)\s*M\b(?!\s*(?:token|credit|crd|coin|char|view|user|member|invite|point|voice))/gi, '$1 Months')
    .replace(/\b(\d+)\s*(?:yrs?|yr)\b/gi, '$1 Years')
    .replace(/\b(\d+)\s*crd\b/gi, '$1 Credits')
    .replace(/\bEdu\b/gi, 'Education');
  return s.replace(/\(\(([^)]+)\)\)/g, '($1)');
}

const TITLE_PHRASE_RULES: Array<[RegExp, string | ((substring: string, ...args: string[]) => string)]> = [
  // Protect IDE & coding tool names first
  [/\bVS\s*Code\b/gi, 'VS Code'],
  [/\bVSCode\b/gi, 'VS Code'],
  [/\bClaude\s*Code\b/gi, 'Claude Code'],
  [/\bClaude\s*Dev\b/gi, 'Claude Code'],
  [/\bRoo\s*Code\b/gi, 'Roo Code'],
  [/\bKilo\s*Code\b/gi, 'Kilo Code'],
  [/\bOpenCode\b/gi, 'OpenCode'],

  // Specific multi-word warranty patterns
  [/\bNo Warranty After Coupon Activation\b/gi, '优惠码激活后无质保'],
  [/\bNo Warranty After Activation\b/gi, '激活后无质保'],
  [/\bNo Warranty After Redeem\b/gi, '兑换后无质保'],
  [/\bNo Refund After Activation\b/gi, '激活后不退不换'],
  [/\bUnused Tokens Refunded\b/gi, '未用 Token 额度可退'],
  [/\bGenuine-or-Refund\b/gi, '保真包退'],
  [/\bNo Refill\b/gi, '掉量不补'],
  [/\bActivation Warranty Only\b/gi, '仅保成功激活'],
  [/\bActivation-Only Warranty\b/gi, '仅保成功激活'],
  [/\bRedeem Warranty Only\b/gi, '仅保成功兑换'],
  [/\bLogin Warranty Only\b/gi, '仅保首次登录'],
  [/\b1-for-1 Login Warranty\b/gi, '首次登录质保·包换'],
  [/\b(\d+)[-–\s]*Min\s+Replacement\b/gi, '$1分钟内包换'],
  [/\bSubscription Warranty\b/gi, '订阅期质保'],
  [/\bLost Plan Only\b/gi, '仅保掉订阅'],
  [/\bFull Warranty\b/gi, '全程质保'],
  [/\bNo Warranty\b/gi, '无质保'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*[-–\s]*Day\s+(?:Hold\s+|Login\s+|Subscription\s+|Activation\s+)?Warranty\b/gi, '$1–$2天质保'],
  [/\b(\d+)[-–\s]*Day\s+Login\s+Warranty\b/gi, '$1天首次登录质保'],
  [/\b(\d+)[-–\s]*Day\s+Subscription\s+Warranty\b/gi, '$1天订阅质保'],
  [/\b(\d+)[-–\s]*Day\s+Activation\s+Warranty\b/gi, '$1天激活质保'],
  [/\b(\d+)[-–\s]*Day\s+(?:Hold\s+|Code\s+|Link\s+)?Warranty\b/gi, '$1天质保'],
  [/\b(\d+)[-–\s]*Week\s+Warranty\b/gi, '$1周质保'],
  [/\b(\d+)[-–\s]*Hour\s+Login\s+Warranty\b/gi, '$1小时首次登录质保'],
  [/\b(\d+)[-–\s]*Hour\s+Activation\s+Warranty\b/gi, '$1小时激活质保'],
  [/\b(\d+)[-–\s]*Hour\s+Link\s+Warranty\b/gi, '$1小时链接质保'],
  [/\b(\d+)[-–\s]*Hour\s+Code\s+Warranty\b/gi, '$1小时兑换码质保'],
  [/\b(\d+)[-–\s]*Hour\s+(?:Hold\s+)?Warranty\b/gi, '$1小时质保'],
  [/\b(\d+)[-–\s]*Month\s+Login\s+Warranty\b/gi, '$1个月登录质保'],
  [/\b(\d+)[-–\s]*Month\s+(?:Subscription\s+)?Warranty\b/gi, '$1个月质保'],
  [/\b(\d+)[-–\s]*Year\s+(?:Subscription\s+)?Warranty\b/gi, '$1年质保'],
  [/\b(\d+)[-–\s]*Minute\s+(?:Login\s+)?Warranty\b/gi, '$1分钟质保'],
  [/\bActivation Warranty\b/gi, '激活质保'],
  [/\bLogin Warranty\b/gi, '首次登录质保'],
  [/\bWarranty\b/gi, '质保'],

  // Compound Account & Delivery Phrases
  [/\bReady Account or Your Account\b/gi, '成品号或本人账号直充'],
  [/\bYour Account or Ready Account\b/gi, '本人账号直充或成品号'],
  [/\bFamily Invite to Your Email\b/gi, '本人邮箱家庭组邀请'],
  [/\bWorkspace Invite to Your Email\b/gi, '本人邮箱工作区邀请'],
  [/\bFamily Admin on Your Email\b/gi, '本人邮箱家庭组管理员'],
  [/\bFamily on Your Own Email\b/gi, '本人邮箱加入家庭组'],
  [/\bInvite to Your Email\b/gi, '发送邀请至本人邮箱'],
  [/\bActivation Link on Your Account\b/gi, '本人账号激活链接'],
  [/\bOfficial CDK on Your Account\b/gi, '官方 CDK 本人账号充值'],
  [/\bCDK on Your Account\b/gi, 'CDK 本人账号激活'],
  [/\bCoupon on Your Account\b/gi, '本人账号优惠券激活'],
  [/\bUpgrade Your Own Account\b/gi, '本人账号直充升级'],
  [/\bUpgrade on Your Account\b/gi, '本人账号代升级'],
  [/\bUpgrade Your Account\b/gi, '本人账号直充升级'],
  [/\bUpgrade on Your Own Email\b/gi, '本人邮箱直充升级'],
  [/\bUpgrade on Your Email\b/gi, '本人邮箱直充升级'],
  [/\bUpgrade Your Email\b/gi, '本人邮箱直充升级'],
  [/\bUpgrade Your Gmail\b/gi, '本人 Gmail 直充升级'],
  [/\bUpgrade by Username\b/gi, '按用户名直充升级'],
  [/\bon Your Own Account\b/gi, '本人账号开通'],
  [/\bon Your Account\b/gi, '本人账号开通'],
  [/\bYour Workspace\b/gi, '本人工作区开通'],
  [/\bYour Account\b/gi, '本人账号直充'],
  [/\bLink on Your Gmail\b/gi, '本人 Gmail 激活链接'],
  [/\bOn Your Gmail\b/gi, '本人 Gmail 开通'],
  [/\bYour Own Email\b/gi, '本人邮箱开通'],
  [/\bYour Email\b/gi, '本人邮箱开通'],
  [/\bto Your Channel\b/gi, '充入本人频道'],
  [/\b1 App of Your Choice\b/gi, '任选1款软件'],
  [/\bUpgrade via Email\b/gi, '邮箱邀请升级'],
  [/\bInvite via Email\b/gi, '邮箱受邀开通'],
  [/\bEmail Invite\b/gi, '邮箱邀请开通'],
  [/\bFamily Invite\b/gi, '家庭组邀请'],
  [/\bTeam Invite\b/gi, '团队版邀请'],
  [/\bFamily Owner Account\b/gi, '家庭组车主账号'],
  [/\bReady Personal Account\b/gi, '个人独享成品号'],
  [/\bPersonal Ready Account\b/gi, '个人独享成品号'],
  [/\bPrivate Ready Account\b/gi, '独享成品号'],
  [/\bReady Admin Account\b/gi, '管理员成品号'],
  [/\bReady New Account\b/gi, '全新成品号'],
  [/\bNew Hand-Registered Account\b/gi, '纯手工新注册账号'],
  [/\bGmail Fresh Account\b/gi, 'Gmail 全新账号'],
  [/\bGoogle Pay Ready Account\b/gi, 'Google Pay 成品号'],
  [/\bApple Pay Ready Account\b/gi, 'Apple Pay 成品号'],
  [/\bApple Pay Account\b/gi, 'Apple Pay 账号'],
  [/\bApple Pay Gmail\b/gi, 'Apple Pay 开通 Gmail 账号'],
  [/\bApple pay\b/gi, 'Apple Pay 开通'],
  [/\bReady Hotmail Account\b/gi, 'Hotmail 成品号'],
  [/\bReady Outlook Account\b/gi, 'Outlook 成品号'],
  [/\bReady Gmail\/iCloud Account\b/gi, 'Gmail/iCloud 成品号'],
  [/\bReady Pixel Gmail Account\b/gi, 'Pixel 权益 Gmail 成品号'],
  [/\bReady Gmail Account\b/gi, 'Gmail 成品号'],
  [/\bEmail-Login Account\b/gi, '邮箱直登账号'],
  [/\bPrivate Pro Team Account\b/gi, '独享 Pro 团队账号'],
  [/\bPrivate UPI Account\b/gi, '独享 UPI 付费账号'],
  [/\bPersonal Account\b/gi, '个人独享账号'],
  [/\bPaid Account\b/gi, '付费正式账号'],
  [/\bFree Account\b/gi, '免费体验账号'],
  [/\bAged US Account\b/gi, '美区耐用老号'],
  [/\bUS Old Account\b/gi, '美区耐用老号'],
  [/\bOlder Account\b/gi, '耐用老号'],
  [/\bOld Account\b/gi, '耐用老号'],
  [/\bReady Account\b/gi, '成品账号'],
  [/\bTrial Account\b/gi, '试用账号'],
  [/\bPrivate Account\b/gi, '独享账号'],
  [/\bShared Account\b/gi, '共享账号'],
  [/\bAged Account\b/gi, '耐用老号'],
  [/\bNew Account\b/gi, '全新账号'],
  [/\bfor New Accounts\b/gi, '限新账号使用'],
  [/\bUS Account Only\b/gi, '仅限美区账号'],
  [/\bShared Slot\b/gi, '共享车位'],
  [/\bFamily Slot\b/gi, '家庭组车位'],
  [/\bFamily Plan\b/gi, '家庭组套餐'],
  [/\bFamily Group\b/gi, '家庭组'],
  [/\b(\d+)[-–\s]*Slot Account\b/gi, '$1车位账号'],
  [/\b(\d+)[-–\s]*Device Slot\b/gi, '$1设备车位'],
  [/\b(\d+)\s*Slots?\b/gi, '$1车位'],
  [/\bSlot\b/gi, '车位'],
  [/\bTeamSocLo Relay Key via CDK\b/gi, 'TeamSocLo 中转密钥（CDK兑换）'],
  [/\bTeamSocLo Relay Key\b/gi, 'TeamSocLo 中转密钥'],
  [/\bRelay Key\b/gi, '中转密钥'],
  [/\bSelf-Activation Key\b/gi, '自助激活密钥'],
  [/\bSelf-Activation\b/gi, '自助激活'],
  [/\bGenuine Key\b/gi, '正版激活密钥'],
  [/\bLogin via Phone Link\b/gi, '手机接码链接登录'],
  [/\bOffer Link\b/gi, '优惠激活链接'],
  [/\bActivation Link\b/gi, '激活链接'],
  [/\bRedeem Link\b/gi, '兑换链接'],
  [/\bInvite Link\b/gi, '邀请链接'],
  [/\bRedeem Code\b/gi, '兑换码'],
  [/\bCDK Code\b/gi, 'CDK 兑换码'],
  [/\bActivation Code\b/gi, '激活码'],
  [/\bRedeem Key\b/gi, '兑换密钥'],
  [/\bActivation Key\b/gi, '激活密钥'],
  [/\bLicense Key\b/gi, '授权密钥'],
  [/\bOfficial Key\b/gi, '官方密钥'],
  [/\bAPI Key\b/gi, 'API 密钥'],
  [/\bAdmin Console\b/gi, '管理员控制台'],
  [/\bAdmin Dashboard\b/gi, '管理员控制面板'],
  [/\bAdmin Panel\b/gi, '管理员后台'],
  [/\bBusiness Admin\b/gi, '商业管理员版'],
  [/\bAdmin\b/gi, '管理员版'],
  [/\bPanel\b/gi, '管理面板'],
  [/\bCoupon Code\b/gi, '优惠兑换券'],
  [/\bCoupon\b/gi, '优惠激活券'],
  [/\bGift Card\b/gi, '礼品卡'],
  [/\bOTP Verification Number\b/gi, 'OTP 接码验证号'],

  // Devices & Seats
  [/\bUnlimited Devices\b/gi, '不限设备数'],
  [/\bLogin on All Devices\b/gi, '全设备通用登录'],
  [/\b1 Phone \+ 1 PC\b/gi, '1台手机 + 1台电脑'],
  [/\bPhone or PC\/Mac\b/gi, '手机/电脑通用'],
  [/\bPhone\/PC\/Mac\b/gi, '手机/电脑通用'],
  [/\biOS Only\b/gi, '仅限 iOS'],
  [/\bWeb Apps Only\b/gi, '仅限网页版'],
  [/\bfor 1 Machine\b/gi, '限1台设备'],
  [/\b(\d+)\s*Windows\s*PCs?\b/gi, '$1台 Windows 电脑'],
  [/\b(\d+)\s*PCs?\b/gi, '$1台电脑'],
  [/\bAndroid\s*&\s*PC\b/gi, '安卓与电脑通用'],
  [/\b(\d+)\s*Devices?\b/gi, '$1台设备'],
  [/\bAdd (\d+)\s*Members?\b/gi, '可添加$1名成员'],
  [/\bInvite (\d+[,\d]*)\s*Users?\b/gi, '可邀请$1名用户'],
  [/\b(\d+[,\d]*)\s*(?:invitations?|invites?)\b/gi, '$1个邀请名额'],
  [/\b(\d+[,\d]*)\s*(?:Users?|Seats?|Members?)\b/gi, '$1个席位'],

  // Duration & Validity
  [/\bLifetime\b/gi, '永久有效'],
  [/\bNo Monthly Expiry\b/gi, '积分永不过期'],
  [/\bNo Expiration\b/gi, '永不过期'],
  [/\bNever Expires?\b/gi, '永不过期'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Days?\b/gi, '$1–$2天'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Months?\b/gi, '$1–$2个月'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Hours?\b/gi, '$1–$2小时'],
  [/\b(\d+)\s*Days?\b/gi, '$1天'],
  [/\b(\d+)\s*Weeks?\b/gi, '$1周'],
  [/\b(\d+)\s*Months?\b/gi, '$1个月'],
  [/\b(\d+)\s*Years?\b/gi, '$1年'],
  [/\b(\d+)\s*Hours?\b/gi, '$1小时'],
  [/\b(\d+)\s*Minutes?\b/gi, '$1分钟'],
  [/\b(\d+)\s*×\s*(\d+)[-–\s]*Second\s+Videos?\b/gi, '$1条$2秒视频'],

  // Credits, Tokens, Traffic & Points
  [/\bUnlimited Credits?\b/gi, '无限积分'],
  [/\bUnlimited Tokens?\b/gi, '无限 Token'],
  [/\bUnlimited Words?\b/gi, '不限字数'],
  [/\b(\d+(?:\.\d+)?)\s*Billion\s*Tokens?\b/gi, (_: string, n: string) => `${Number(n) * 10}亿 Token`],
  [/\b(\d+(?:[.,]\d+)?\s*[KMB]?)\s*AI\s*Credits?\b/gi, '$1 AI 积分'],
  [/\b(\d+(?:[.,]\d+)?\s*[KMB]?)\s*Credits?\b/gi, '$1 积分'],
  [/\b(\d+(?:[.,]\d+)?\s*[KMB]?)\s*Tokens?\b/gi, '$1 Token'],
  [/\b(\d+(?:[.,]\d+)?\s*[KMB]?)\s*Points?\b/gi, '$1 点数'],
  [/\b(\d+(?:[.,]\d+)?\s*[KMB]?)\s*Coins?\b/gi, '$1 金币'],
  [/\b(\d+[,\d]*)\s*Diamonds?\b/gi, '$1 钻石'],
  [/\b(\d+[,\d]*)\s*Followers?\b/gi, '$1 粉丝'],
  [/\b(\d+[,\d]*)\s*Subscribers?\b/gi, '$1 订阅粉丝'],
  [/\b(\d+[,\d]*)\s*Monthly\s*Users?\b/gi, '$1 月活用户'],
  [/\b(\d+[,\d]*)\s*Images?\b/gi, '$1 张图片'],
  [/\b(\d+[,\d]*)\s*Videos?\b/gi, '$1 条视频'],
  [/\b(\d+)\s*Apps?\b/gi, '$1款应用'],
  [/\b\$(\d+[,\d]*(?:\.\d+)?)\s*Credit\b/gi, '$$$1 额度'],
  [/\b(\d+)\s*GB\s*Cloud\b/gi, '$1 GB 云空间'],
  [/\b(\d+)\s*TB\s*Cloud\b/gi, '$1 TB 云空间'],

  // Features & Qualification
  [/\bPhone-Verified\b/gi, '已过手机验证'],
  [/\bPhone Verified\b/gi, '已过手机验证'],
  [/\bNo 2FA\b/gi, '免2FA验证'],
  [/\bWith 2FA\b/gi, '带2FA验证'],
  [/\bwith 2FA\b/gi, '带2FA验证'],
  [/\bNo YouTube Channel\b/gi, '未开通 YouTube 频道'],
  [/\bAged\s*(\d{4}[-–]\d{4})\b/gi, '$1注册老号'],
  [/\bAged\s*(\d{4})\b/gi, '$1年老号'],
  [/\bNo Ads\b/gi, '免广告'],
  [/\bAd-Free\b/gi, '免广告'],
  [/\b4K UHD\b/gi, '4K 超高清'],
  [/\bFull Access\b/gi, '完整权限'],
  [/\bFast-Track\b/gi, '极速通道'],
  [/\bHigh Speed\b/gi, '高速稳定'],
  [/\bGlobal\b/gi, '全球通用'],
  [/\bWorldwide\b/gi, '全球通用'],
  [/\bNo VPN Needed\b/gi, '免 VPN 直连'],
  [/\bNo Credit Card Needed\b/gi, '免绑卡'],
  [/\bStudent Verification\b/gi, '学生资格认证'],
  [/\bTeacher Verification\b/gi, '教师资格认证'],
  [/\bVerification Link\b/gi, '认证链接'],
  [/\bVerification\b/gi, '验证服务'],
  [/\bwith AI\b/gi, '含 AI 功能'],
  [/\bwith Codex\b/gi, '含 Codex 权限'],
  [/\bOutside Vietnam\b/gi, '非越南区通用'],
  [/\bIndia VPN Needed\b/gi, '需印度节点激活'],
  [/\bIndia Region\b/gi, '印度区'],
  [/\bUSA? Region\b/gi, '美区'],
  [/\bFrance\s*\(FR\)\b/gi, '法国区'],
  [/\bVietnam\b/gi, '越南区'],
  [/\bNot a Trial\b/gi, '正式订阅非试用'],
  [/\bOwn Card Needed\b/gi, '需自备绑卡'],
  [/\bChange 2FA Right Away\b/gi, '到手请立即修改2FA'],
  [/\bPhilippines Payment\b/gi, '菲律宾区支付'],
  [/\bUPI Billing\b/gi, 'UPI 账单开通'],
  [/\bMulti-Model\b/gi, '多模型通用'],
  [/\bNot Renewable\b/gi, '不可续费'],
  [/\bRenewable\b/gi, '可续费'],
  [/\bRandom Plan\b/gi, '随机套餐'],
  [/\bOld Plan\b/gi, '旧版套餐'],
  [/\bNew Plan\b/gi, '新版套餐'],
  [/\bK12 Teacher\b/gi, 'K12 教师版'],
  [/\bTeacher\b/gi, '教师版'],
  [/\bfor Education\b/gi, '教育版'],
  [/\bEducation\s+Mail\b/gi, '教育邮箱 (.edu)'],
  [/\bFresh\s+Education\s+Mail\b/gi, '全新教育邮箱 (.edu)'],
  [/\bFresh\s+Edu\s+Mail\b/gi, '全新教育邮箱 (.edu)'],
  [/\bEducation\b/gi, '教育版'],
  [/\bIndividual\b/gi, '个人版'],
  [/\bPersonal\b/gi, '个人版'],
  [/\bAll Apps\b/gi, '全家桶全套应用'],
  [/\bEmails Outlook\/hotmail\b/gi, 'Outlook / Hotmail 耐用邮箱账号'],
  [/\bGmail USA \(global\)/gi, '美国 Gmail 邮箱（全球通用）'],
  [/\bGmail mix ip\b/gi, 'Gmail 耐用邮箱（多国 IP）'],
  [/\bPremium Rotating Proxy\b/gi, '高速动态轮换代理 IP'],
  [/\bFacebook Followers\b/gi, 'Facebook 粉丝增长'],
  [/\bYouTube Subscribers\b/gi, 'YouTube 频道订阅增长'],
  [/\bTelegram Bot Monthly Users\b/gi, 'Telegram 机器人月活用户'],
  [/\bProfile or Page\b/gi, '个人主页/公共主页'],
  [/\bAccount\s*\+\s*Key\b/gi, '账号 + 激活密钥'],
  [/\bOne Code\b/gi, '单次验证码'],
  [/\bOfficial\b/gi, '官方版'],
  [/\bTrial\b/gi, '试用版'],
  [/\bAccount\b/gi, '账号'],
  [/\bKey\b/gi, '密钥'],
  [/\b(?<!VS\s|Claude\s|Roo\s|Kilo\s)Code\b/gi, '兑换码'],
  [/\bLink\b/gi, '激活链接'],
  [/\bMethod\b/gi, '开通方案'],
];

const PURE_BRAND_SUFFIX: Array<[RegExp, string]> = [
  [/^ChatGPT Plus$/i, 'ChatGPT Plus 会员订阅'],
  [/^Netflix Premium$/i, 'Netflix 4K 高级会员'],
  [/^Spotify Premium$/i, 'Spotify Premium 音乐会员'],
  [/^YouTube Premium$/i, 'YouTube Premium 免广告会员'],
  [/^Canva Pro$/i, 'Canva Pro 可画专业版会员'],
  [/^Microsoft 365$/i, 'Microsoft 365 办公套件订阅'],
  [/^Disney\+ Premium$/i, 'Disney+ 高清影视会员'],
  [/^Notion AI$/i, 'Notion AI 效率笔记订阅'],
  [/^Muse AI$/i, 'Muse AI 创作会员'],
  [/^Pixel\s*·\s*(.+)$/i, 'Google Pixel 账号任务 · $1'],
  [/^SheerID\s*·\s*(.+)$/i, 'SheerID 学生/资格认证 · $1'],
];

export function translateTitleDeterministic(rawName: string): string {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return trimmed;
  for (const [re, replacement] of PURE_BRAND_SUFFIX) {
    if (re.test(trimmed)) return trimmed.replace(re, replacement);
  }
  if (isMostlyChinese(trimmed)) return postProcessChineseText(trimmed);

  let s = normalizeEnglishTitle(trimmed);
  for (const [re, replacement] of TITLE_PHRASE_RULES) {
    s = s.replace(re, replacement as string);
  }
  s = s
    .replace(/\bFresh\s+教育版\s+Mail\b/gi, '全新教育邮箱 (.edu)')
    .replace(/\s+,\s+/g, '，')
    .replace(/,\s+/g, '，')
    .replace(/\s+\(([^)]+)\)/g, '（$1）')
    .replace(/\[([^\]]+)\]/g, '【$1】')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!hasChinese(s)) {
    s = `${s} 会员订阅`;
  }
  return postProcessChineseText(s);
}

export function postProcessChineseText(zh: string, productTitle = ''): string {
  let out = (zh || '')
    // 1. Fix IDE & coding tool names that were machine-translated
    .replace(/VS\s*兑换码|VS\s*代码|VSCode\s*兑换码/gi, 'VS Code')
    .replace(/claude\s*兑换码|Claude\s*代码|克劳德代码|克劳德兑换码/gi, 'Claude Code')
    .replace(/\bClaude\s*Dev\b/gi, 'Claude Code')
    .replace(/Roo\s*兑换码|Roo\s*代码/gi, 'Roo Code')
    .replace(/Kilo\s*兑换码|Kilo\s*代码/gi, 'Kilo Code')
    .replace(/全部完成并准备兑换码！|全部完成并准备代码！|准备好代码！|ready\s*兑换码/gi, '配置完成，即可开始编程使用！')
    // 2. Fix AI model names & brand names that were translated literally
    .replace(/gpt-6-阿斯特拉/gi, 'gpt-6-astra')
    .replace(/gpt-6-索尔/gi, 'gpt-6-sol')
    .replace(/gpt-6-露娜|gpt-5\.6-露娜/gi, m => m.replace(/露娜/g, 'luna'))
    .replace(/gpt-5\.6-泰拉/gi, 'gpt-5.6-terra')
    .replace(/阿斯特拉/g, 'Astra')
    .replace(/克劳德/g, 'Claude')
    .replace(/Google\s*AI\s*Pro\s*[（(]双子座[)）]/gi, 'Google AI Pro（Gemini）')
    .replace(/双子座/g, 'Gemini')
    .replace(/概念代理/g, 'Notion AI 智能体 (Agent)')
    .replace(/也传递概念|登录并传递概念/g, '并使用相同的邮箱和密码登录 Notion')
    // 3. Fix AI API terminology (Tokens, Models, Keys, Playground, Credits)
    .replace(/(\d+\s*[KMB千百万亿]?)\s*代币/gi, '$1 Token')
    .replace(/未使用代币|未使用的代币/g, '未使用的 Token 额度')
    .replace(/代币的退款/g, 'Token 额度的退款')
    .replace(/可用型号/g, '支持模型')
    .replace(/理想的型号|理想型号/g, '合适的模型')
    .replace(/型号[：:]/g, '支持模型：')
    .replace(/；型号\s+/g, '；支持模型：')
    .replace(/。型号[：:]?/g, '。支持模型：')
    .replace(/将\s*CDK\s*换成您的\s*SSH/gi, '使用 CDK 兑换您的 API 密钥')
    .replace(/将\s*CDK\s*换成\s*API\s*密钥/gi, '使用 CDK 兑换 API 密钥')
    .replace(/第三方\s*API\s*网关的钥匙/gi, '第三方 API 网关的密钥')
    .replace(/质保期内钥匙/g, '质保期内密钥')
    .replace(/有缺陷的钥匙/g, '故障密钥')
    .replace(/直接输入按键/g, '直接填入 API 密钥')
    .replace(/网络游乐场/g, '网页端工作台 (Web Playground)')
    .replace(/信用额度|信用额/g, '额度')
    .replace(/未使用的信用/g, '未使用的额度')
    // 4. Fix OTP / verification code / login code / email format terminology
    .replace(/OTP\s*兑换码从这里[：:]?/gi, 'OTP 验证码接收地址：')
    .replace(/OTP\s*网站[：:]?/gi, 'OTP 验证码接收地址：')
    .replace(/格式化邮件\s*\|\s*邮箱/g, '发货格式：登录邮箱 | 接码邮箱地址')
    .replace(/格式化\s*Gmail\s*\|\s*密码/gi, '发货格式：Gmail 邮箱 | 密码')
    .replace(/格式化登录用户\s*\|\s*通过\s*\|\s*2fa/gi, '发货格式：用户名 | 密码 | 2FA 密钥')
    .replace(/格式化[：:]?\s*(邮箱|邮件|账号|用户名)/g, '发货格式：$1')
    .replace(/E邮箱/g, '邮箱')
    .replace(/2FA双重验证键|2FA键/g, '2FA 密钥')
    .replace(/6\s*位兑换码/g, '6位验证码')
    .replace(/登录兑换码来到\s*Outlook\s*邮箱成品号/g, '登录验证码会发送至随附的 Outlook 邮箱')
    .replace(/登录兑换码/g, '登录验证码')
    .replace(/使用发送给它的兑换码登录/g, '使用发送到该邮箱的验证码登录')
    .replace(/将号码复制到服务中并发送兑换码\s*[-—]\s*它会单独出现在页面上。\s*每个激活链接单次验证码；重新打开激活链接即可再次看到它。/g, '将号码复制到目标服务并发送验证码——验证码会自动显示在网页上。每个链接可接收一次验证码；重新打开链接即可再次查看。')
    // 5. General warranty & account phrasing cleanup
    .replace(/准备好的帐户|准备好的账号|就绪帐户|就绪账号|现成帐户|现成账号/g, '成品账号')
    .replace(/完整保修|全面保修|全额保修|完全保修/g, '全程质保')
    .replace(/没有保修|无保修|不保修/g, '无质保')
    .replace(/激活保修/g, '激活质保')
    .replace(/登录保修/g, '首次登录质保')
    .replace(/保修期/g, '质保期')
    .replace(/保修/g, '质保')
    .replace(/家庭插槽|家庭槽位/g, '家庭组车位')
    .replace(/共享插槽|共享槽位/g, '共享车位')
    .replace(/1\s*个插槽|1个槽位/g, '1车位')
    .replace(/插槽/g, '车位')
    .replace(/电子邮件/g, '邮箱')
    .replace(/帐户/g, '账号')
    .replace(/双重身份验证|双因素身份验证/g, '双重验证 (2FA)')
    // 6. Residual machine-translation fixes (API keys, models, tokens, credits, verification codes)
    .replace(/密码\s*\|\s*兑换码\s*[-—]\s*读取激活链接进行验证兑换码/g, '密码 | 验证码（读取激活链接获取验证码）')
    .replace(/邮箱\s*\|\s*密码\s*\|\s*兑换码(?!\s*[-—]?\s*激活)/g, '邮箱 | 密码 | 验证码')
    .replace(/进行验证兑换码/g, '获取验证码')
    .replace(/(\d[\d,.]*\s*[KMB万亿]?)\s*代币/gi, '$1 Token')
    .replace(/代币/g, 'Token')
    .replace(/学分/g, '积分')
    .replace(/2FA双重验证钥匙|2FA\s*钥匙/g, '2FA 双重验证密钥')
    .replace(/API\s*钥匙|API\s*密钥/g, 'API 密钥')
    .replace(/钥匙/g, '密钥')
    .replace(/型号/g, '模型')
    .replace(/型号列表/g, '模型列表')
    .replace(/型号(?=[：:、，,（(]|\s*(?:gpt|claude|deepseek|qwen|grok|glm|kimi|[A-Z]))/g, '模型')
    .replace(/(Claude Opus \/ Sonnet \/ Haiku(?: \/ Fable)?)\s*模型/g, '$1 模型')
    .replace(/(Qwen|GLM|Grok|DeepSeek|Nano Banana|Seedream|Seedance)([^\n]{0,12}?)型号/g, '$1$2模型')
    .replace(/轴检查页面/g, '密钥检查页面')
    .replace(/4\s*位兑换码/g, '4 位验证码')
    .replace(/老虎机/g, '车位')
    .trim();

  // Context check: if the product title is NOT an Outlook/Hotmail email product, never call the bound email "Outlook 邮箱成品号"
  if (productTitle && !/outlook|hotmail/i.test(productTitle.split('–')[0])) {
    out = out
      .replace(/完全访问\s*Outlook\s*邮箱成品号/g, '附带绑定 Outlook 邮箱的完整登录权限')
      .replace(/Outlook\s*邮箱成品号/g, '绑定的 Outlook 邮箱');
  }
  if (/notion/i.test(productTitle)) {
    out = out.replace(/应用概念商业计划/g, '应用 Notion Business 商业版计划').replace(/概念(?=\s*(?:商业|商务|Plus|AI|团队|教育|工作))/g, 'Notion').replace(/概念/g, 'Notion');
  }
  if (/netflix/i.test(productTitle)) {
    out = out.replace(/Private\s*车位/g, '独立档案').replace(/私人档案（车位）/g, '独立个人档案').replace(/邮件\s*\|\s*通行证\s*\|\s*车位/g, '邮箱 | 密码 | 档案名');
  }
  if (/minimax/i.test(productTitle)) {
    out = out.replace(/^📦\s*(?:准备好|Ready)\s*MiniMax/, '📦 成品 MiniMax');
  }
  return out;
}

export function generateFallbackDescription(
  nameEn: string,
  nameZh: string,
  delivery: string,
  requiresEmail: boolean,
  inputKind?: string,
): { zh: string; en: string } {
  if (inputKind === 'pixel') {
    return {
      zh: `📦 服务内容：${nameZh}\n⚡ 办理方式：付款核实后，请在订单详情页提交本人 Gmail 账号密码及 2FA 双重验证密钥，系统将自动加密传输至供货商完成任务处理。`,
      en: `📦 Service: ${nameEn}\n⚡ Fulfillment: After payment verification, submit your Gmail credentials and 2FA secret on the private order page for automated task processing.`,
    };
  }
  if (inputKind === 'sheerid') {
    return {
      zh: `📦 服务内容：${nameZh}\n⚡ 办理方式：付款核实后，请在订单详情页提交本人有效的 SheerID 验证链接，系统将自动提交认证处理。`,
      en: `📦 Service: ${nameEn}\n⚡ Fulfillment: After payment verification, submit your eligible SheerID verification link on the private order page for automated verification.`,
    };
  }
  const deliveryZh = requiresEmail
    ? '付款核实后为您直接充值/邀请至下单填写的本人邮箱，无需提供原账号密码。'
    : delivery === 'instant'
      ? '付款核实后自动发卡，您可在私密订单页直接查看账号、卡密或兑换链接。'
      : '付款核实后由客服为您安排人工交付，进度可在私密订单页实时查看。';
  const deliveryEn = requiresEmail
    ? 'Activated directly on the email address you provide at checkout after payment verification.'
    : delivery === 'instant'
      ? 'Instant digital delivery after payment confirmation. View your credentials, key, or redeem link directly on your private order page.'
      : 'Fulfilled by the store after payment verification. Track progress on your private order page.';

  return {
    zh: `📦 商品规格：${nameZh}\n⚡ 交付说明：${deliveryZh}\n🛡️ 售后须知：请仔细核对标题所示的有效期、设备数量及质保范围；如遇登录或激活问题，请保留订单号联系客服处理。`,
    en: `📦 Product: ${nameEn}\n⚡ Delivery: ${deliveryEn}\n🛡️ Warranty & Terms: Please review the duration, device limit, and warranty terms indicated in the title. Keep your order ID for customer support.`,
  };
}

export function prepareDescriptionForTranslation(rawDesc: string, productTitleEn = ''): { prepared: string; placeholders: Map<string, string> } {
  let s = (rawDesc || '').trim();
  const placeholders = new Map<string, string>();
  let idx = 0;
  const protect = (val: string) => {
    const token = `__ Term${idx++} __`;
    placeholders.set(token.trim(), val);
    return token;
  };

  // Reconcile known upstream copy-paste duration/token mismatches against product title
  if (/100M\s*Token\s*-\s*3\s*day/i.test(productTitleEn)) {
    s = s
      .replace(/50M\s*Token\s*-\s*2\s*day/gi, '100M Token - 3 days')
      .replace(/Validity:\s*2\s*Days?/gi, 'Validity: 3 Days');
  }
  if (/Avira\s*VPN\s*1\s*Month/i.test(productTitleEn)) {
    s = s.replace(/\b3\s*Months?\b/gi, '1 Month');
  }

  // Context-aware phrase pre-translations before machine/AI translation
  s = s
    .replace(/\bVS\s*Code\b|\bVSCode\b/gi, () => protect('VS Code'))
    .replace(/\bClaude\s*Code\b|\bClaude\s*Dev\b/gi, () => protect('Claude Code'))
    .replace(/\bRoo\s*Code\b/gi, () => protect('Roo Code'))
    .replace(/\bKilo\s*Code\b/gi, () => protect('Kilo Code'))
    .replace(/\bOpenCode\b/gi, () => protect('OpenCode'))
    .replace(/\b9router\b/gi, () => protect('9Router'))
    .replace(/\b(?:gpt|claude|deepseek|grok|qwen|kimi|glm)-[a-z0-9.\-]+\b/gi, m => protect(m))
    .replace(/All done\s*&\s*Ready to code!/gi, '配置完成，即可开始编程使用！')
    .replace(/Otp Code from here\s*:/gi, 'OTP 验证码接收地址：')
    .replace(/otp site\s*:/gi, 'OTP 验证码接收地址：')
    .replace(/Format\s+Mail\s*\|\s*Mailbox/gi, '发货格式：登录邮箱 | 接码邮箱地址')
    .replace(/Format\s*[,:]?\s*email\s*\|\s*password\s*\|\s*(?:email\s*)?token/gi, '发货格式：邮箱 | 密码 | 邮箱令牌 (Token)')
    .replace(/Format\s*[,:]?\s*email\s*\|\s*password\s*\|\s*2FA(?:\s*key)?/gi, '发货格式：邮箱 | 密码 | 2FA 密钥')
    .replace(/Format\s*[,:]?\s*Email\s*\|\s*Pass\s*\|\s*2FA/gi, '发货格式：邮箱 | 密码 | 2FA 密钥')
    .replace(/Format\s*[,:]?\s*account\s*\|\s*password\s*\|\s*2FA(?:\s*key)?/gi, '发货格式：账号 | 密码 | 2FA 密钥')
    .replace(/format\s+login\s+user\s*\|\s*pass\s*\|\s*2fa/gi, '发货格式：用户名 | 密码 | 2FA 密钥')
    .replace(/Format\s*[,:]?\s*Gmail\s*\|\s*password/gi, '发货格式：Gmail 邮箱 | 密码')
    .replace(/Format\s*[,:]?\s*email\s*\|\s*password/gi, '发货格式：邮箱 | 密码')
    .replace(/Exchange the CDK for (?:your|an API) key/gi, '使用 CDK 兑换码兑换您的 API 密钥')
    .replace(/Convert the CDK to a key/gi, '使用 CDK 兑换码兑换 API 密钥')
    .replace(/delivered as a CDK(?: code)? that you (?:exchange|convert) for (?:an API|a) key/gi, '以 CDK 兑换码形式自动发货，可在兑换页兑换为 API 密钥')
    .replace(/delivered as a CDK, exchanged for the key on the supplier's redeem page/gi, '以 CDK 兑换码形式发货，可在供货商兑换页兑换为 API 密钥')
    .replace(/refund(?:ed)? for the (?:tokens you have not used|unused tokens)/gi, '按未使用的 Token 额度为您退款')
    .replace(/FULL ACCESS TO OUTLOOK MAIL/gi, '附带绑定 Outlook 邮箱的完整登录权限')
    .replace(/login code comes to the Outlook mail/gi, '登录验证码将发送至随附的 Outlook 邮箱')
    .replace(/To login go to outlook\.com first then login there and login with same email:pass on notion too/gi, '登录方式：请先访问 outlook.com 登录邮箱，再使用相同的邮箱和密码登录 Notion')
    .replace(/\bAvailable Models\s*:/gi, '支持模型：')
    .replace(/\bModels\s*:/gi, '支持模型：');

  return { prepared: s, placeholders };
}

export function restorePlaceholders(text: string, placeholders: Map<string, string>): string {
  let out = text;
  for (const [token, val] of placeholders.entries()) {
    const id = token.replace(/^__\s*|\s*__$/g, '');
    const re = new RegExp(`__\\s*${id}\\s*__`, 'gi');
    out = out.replace(re, val);
  }
  return out;
}

export function translateDescriptionDeterministic(rawDesc: string, nameZh: string, delivery = 'instant', requiresEmail = false, inputKind = '', nameEn = ''): string {
  const trimmed = (rawDesc || '').trim();
  if (!trimmed) {
    return generateFallbackDescription(nameEn || nameZh, nameZh, delivery, requiresEmail, inputKind).zh;
  }
  if (isMostlyChinese(trimmed)) return postProcessChineseText(trimmed, nameEn || nameZh);

  const { prepared, placeholders } = prepareDescriptionForTranslation(trimmed, nameEn || nameZh);
  const restored = restorePlaceholders(prepared, placeholders);
  return postProcessChineseText(restored, nameEn || nameZh);
}

export async function googleTranslateToZh(text: string, timeoutMs = 6000, force = false, productTitleEn = ''): Promise<string> {
  const trimmed = (text || '').trim();
  if (!trimmed || (!force && isMostlyChinese(trimmed))) return postProcessChineseText(trimmed, productTitleEn);

  const { prepared, placeholders } = prepareDescriptionForTranslation(trimmed, productTitleEn);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(prepared)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as unknown[];
    const segments = Array.isArray(data?.[0]) ? (data[0] as unknown[][]) : [];
    const translated = segments.map(seg => (typeof seg?.[0] === 'string' ? seg[0] : '')).join('');
    const restored = restorePlaceholders(translated || prepared, placeholders);
    return postProcessChineseText(restored, productTitleEn);
  } catch {
    return translateDescriptionDeterministic(trimmed, '', 'instant', false, '', productTitleEn);
  } finally {
    clearTimeout(timer);
  }
}

export function localizeProductSync(input: {
  sourceId?: string;
  name: string;
  description?: string;
  delivery?: string;
  requiresEmail?: boolean;
  inputKind?: string;
}): { nameZh: string; nameEn: string; descZh: string; descEn: string } {
  const rawName = (input.name || '').trim();
  let rawDesc = (input.description || '').trim();
  if (input.sourceId && CURATED_BY_SOURCE_ID[input.sourceId]) {
    const curated = CURATED_BY_SOURCE_ID[input.sourceId];
    return {
      nameZh: curated.nameZh,
      nameEn: rawName,
      descZh: curated.descZh,
      descEn: curated.descEn ?? rawDesc,
    };
  }
  const delivery = input.delivery || 'instant';
  const requiresEmail = !!input.requiresEmail;
  const inputKind = input.inputKind || '';

  // Fix known upstream English description contradictions
  if (/100M\s*Token\s*-\s*3\s*day/i.test(rawName)) {
    rawDesc = rawDesc
      .replace(/50M\s*Token\s*-\s*2\s*day/gi, '100M Token - 3day')
      .replace(/Validity:\s*2\s*Days?/gi, 'Validity: 3 Days');
  }
  if (/Avira\s*VPN\s*1\s*Month/i.test(rawName)) {
    rawDesc = rawDesc.replace(/\b3\s*Months?\b/gi, '1 Month');
  }

  const nameIsZh = isMostlyChinese(rawName);
  const nameEn = rawName;
  const nameZh = nameIsZh ? postProcessChineseText(rawName) : translateTitleDeterministic(rawName);

  if (!rawDesc) {
    const fb = generateFallbackDescription(nameEn, nameZh, delivery, requiresEmail, inputKind);
    return { nameZh, nameEn, descZh: fb.zh, descEn: fb.en };
  }

  const descIsZh = isMostlyChinese(rawDesc);
  if (descIsZh) {
    const fbEn = generateFallbackDescription(nameEn, nameZh, delivery, requiresEmail, inputKind).en;
    return { nameZh, nameEn, descZh: postProcessChineseText(rawDesc, nameEn), descEn: fbEn };
  }

  return {
    nameZh,
    nameEn,
    descZh: translateDescriptionDeterministic(rawDesc, nameZh, delivery, requiresEmail, inputKind, nameEn),
    descEn: rawDesc,
  };
}
