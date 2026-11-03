const ZH_RE = /[\u4e00-\u9fa5]/;
const ZH_GLOBAL_RE = /[\u4e00-\u9fa5]/g;

export function hasChinese(text: string): boolean {
  return ZH_RE.test(text);
}

export function isMostlyChinese(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  const zhMatches = trimmed.match(ZH_GLOBAL_RE);
  const zhCount = zhMatches ? zhMatches.length : 0;
  if (zhCount === 0) return false;
  const enWords = trimmed.replace(ZH_GLOBAL_RE, ' ').match(/[A-Za-z]{2,}/g)?.length ?? 0;
  return zhCount >= 4 && zhCount >= enWords * 0.35;
}

export function normalizeEnglishTitle(raw: string): string {
  let s = (raw || '').trim().replace(/\s+/g, ' ');
  s = s
    .replace(/\[KEY\]/gi, '[Activation Key]')
    .replace(/\bFW\b/gi, '(Full Warranty)')
    .replace(/\bNW\b/gi, '(No Warranty)')
    .replace(/\b(\d+)\s*[-–]\s*(\d+)\s*D\b/gi, '$1–$2 Days')
    .replace(/\b(\d+)\s*D\b(?!\s*(?:render|model|print|audio|animation|video))/gi, '$1 Days')
    .replace(/\b(\d+)\s*M\b(?!\s*(?:token|credit|crd|coin|char|view|user|member|invite))/gi, '$1 Months')
    .replace(/\b(\d+)\s*(?:yrs?|yr)\b/gi, '$1 Years')
    .replace(/\b(\d+)\s*crd\b/gi, '$1 Credits')
    .replace(/\bEdu\b/gi, 'Education');
  return s.replace(/\(\(([^)]+)\)\)/g, '($1)');
}

const TITLE_PHRASE_RULES: Array<[RegExp, string]> = [
  // Specific multi-word warranty patterns
  [/\bNo Warranty After Activation\b/gi, '激活后无质保'],
  [/\bNo Warranty After Redeem\b/gi, '兑换后无质保'],
  [/\bNo Refund After Activation\b/gi, '激活后不退不换'],
  [/\bUnused Tokens Refunded\b/gi, '未用额度可退'],
  [/\bGenuine-or-Refund\b/gi, '保真包退'],
  [/\bNo Refill\b/gi, '掉粉不补'],
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
  [/\bUp to (\d+[,\d]*)\s*Seats?\b/gi, '最多$1个席位'],
  [/\b(\d+[,\d]*)\s*(?:Seats?|Users?|Members?)\b/gi, '$1个席位'],
  [/\b(\d+[,\d]*)\s*(?:invitations?|invites?)\b/gi, '$1个邀请名额'],
  [/\b(\d+[,\d]*)\s*Participants?\b/gi, '$1人参会'],

  // Credits, Tokens, Packages, Followers
  [/\bUnlimited Tokens\b/gi, '无限 Token'],
  [/\bNo AI Credits\b/gi, '不含 AI 积分'],
  [/\bRandom (\d+[-–][0-9.,]+[KMB]?)\s*Credits?\b/gi, '随机 $1 积分'],
  [/\b([0-9.,]+[KMB]?)\s*Shared\s*Credits?\b/gi, '$1 共享积分'],
  [/\b([0-9.,]+[KMB]?)\s*Private\s*Credits?\b/gi, '$1 独享积分'],
  [/\bwith\s+(\d+)\s*Trial\s*Credits?\b/gi, '含$1试用积分'],
  [/\b([0-9.,]+[KMB]?)\s*Trial\s*Credits?\b/gi, '$1 试用积分'],
  [/\bFull\s+([0-9.,]+[KMB]?)\s*Credits?\b/gi, '满额 $1 积分'],
  [/\b([0-9.,]+[KMB]?)\s*(?:AI\s+)?Credits?\/Month\b/gi, '每月 $1 积分'],
  [/\b([0-9.,]+[KMB]?)\s*(?:AI\s+)?Credits?\b/gi, '$1 积分'],
  [/\b([0-9.,]+)\s*Billion\s*Tokens?\b/gi, '$10亿 Token'],
  [/\b([0-9.,]+[KMB]?)\s*Tokens?\b/gi, '$1 Token'],
  [/\$([0-9.,]+)\s*Credit\b/gi, '$$$1 额度'],
  [/\$([0-9.,]+)\s*Package\b/gi, '$$$1 套餐包'],
  [/\b([0-9.,]+)\s*Diamonds?\b/gi, '$1 钻石'],
  [/\b([0-9.,]+)\s*Images?\b/gi, '$1 张图片额度'],
  [/\b([0-9.,]+)\s*Videos?\b/gi, '$1 个视频额度'],
  [/\b([0-9.,]+[KMB]?)\+?\s*Real\s*Followers\b/gi, '$1真实粉丝'],
  [/\b([0-9.,]+[KMB]?)\+?\s*Followers\b/gi, '$1粉丝'],
  [/\bNo Followers\b/gi, '0粉新号'],
  [/\bRandom Likes\b/gi, '带随机点赞'],

  // Durations & Account Age
  [/\bAged\s+(\d+)\+?\s*Years?\b/gi, '$1年以上耐用老号'],
  [/\b(\d+)\+?\s*Years?\s*Old\b/gi, '$1年以上老号'],
  [/\bAged\s+(\d+(?:[-–]\d+)?)\s*Months?\b/gi, '$1个月耐用老号'],
  [/\bRandom\s+(\d+(?:[-–]\d+)?)\s*Months?\s*Old\b/gi, '$1个月随机老号'],
  [/\b(\d+(?:[-–]\d+)?)\s*Days?\s*Old\b/gi, '注册$1天'],
  [/\bAged\s+(20\d[\dX][-–]20\d[\dX])\b/gi, '$1注册老号'],
  [/\bOld\s+Random\s+(20\d[\dX][-–]20\d[\dX])\b/gi, '$1随机老号'],
  [/\bRandom\s+Year\s+(20\d[\dX][-–]20\d[\dX])\b/gi, '$1随机年份老号'],
  [/\bRandom\s+(20\d[\dX][-–]20\d[\dX])\b/gi, '$1随机年份'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Days?\s+Remaining\b/gi, '剩余$1–$2天'],
  [/\b(\d+)\s*Days?\s+Remaining\b/gi, '剩余$1天'],
  [/\b(\d+)[-–\s]*Day\s+Trial\b/gi, '$1天试用版'],
  [/\bwith\s+(\d+)[-–\s]*Month\s+Plus\s+Offer\b/gi, '含$1个月 Plus 优惠资格'],
  [/\b(\d+)[-–\s]*Month\s+Plus\s+Offer\b/gi, '含$1个月 Plus 优惠资格'],
  [/\b\$0\s+First-Month\s+Offer\b/gi, '首月$0优惠资格'],
  [/\b50%\s+Offer\s+Needed\b/gi, '需账号自带半价优惠资格'],
  [/\bPixel\s+Offer\b/gi, 'Pixel 专属权益版'],
  [/\b(\d+)[-–\s]*Hour\s+Login\s+Check\b/gi, '$1小时登录核验'],
  [/\bChange\s+2FA\s+Within\s+(\d+)\s*Hours?\b/gi, '需$1小时内修改2FA'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Days?\b/gi, '$1–$2天'],
  [/\b(\d+)\s*[-–]\s*(\d+)\s*Months?\b/gi, '$1–$2个月'],
  [/\b(\d+)[-–\s]*Day\b/gi, '$1天'],
  [/\b(\d+)\s*Days?\b/gi, '$1天'],
  [/\b(\d+)[-–\s]*Month\b/gi, '$1个月'],
  [/\b(\d+)\s*Months?\b/gi, '$1个月'],
  [/\b(\d+)[-–\s]*Year\b/gi, '$1年'],
  [/\b(\d+)\s*Years?\b/gi, '$1年'],
  [/\b(\d+)\s*Hours?\b/gi, '$1小时'],
  [/\bLifetime\b/gi, '永久有效'],
  [/\bPermanent\b/gi, '永久有效'],

  // Misc qualifiers & Regions
  [/\bMonthly Renewal\b/gi, '按月自动续期'],
  [/\bNo Monthly Expiry\b/gi, '积分永不过期'],
  [/\bPhone-Verified\b/gi, '已过手机验证'],
  [/\bUnverified\b/gi, '未实名验证'],
  [/\bCookie Login\b/gi, 'Cookie 登录'],
  [/\bPhone Login\b/gi, '手机号登录'],
  [/\bFor Bulk Messaging\b/gi, '适合群发营销'],
  [/\bPhone LIVE\b/gi, '支持手机开播'],
  [/\bLIVE Studio Ready\b/gi, '已开直播伴侣 (LIVE Studio)'],
  [/\bLIVE Studio Access\b/gi, '已开直播伴侣权限'],
  [/\bLIVE Studio\b/gi, '支持直播伴侣'],
  [/\bLIVE & Shopping Cart Enabled\b/gi, '已开通直播与小黄车'],
  [/\bHotmail Trusted\b/gi, 'Hotmail 高信誉号'],
  [/\bRandom IP\b/gi, '随机 IP'],
  [/\bWith Recovery Email\b/gi, '带辅助邮箱'],
  [/\bMail Access\b/gi, '含邮箱权限'],
  [/\bSuitable for YouTube Trial\b/gi, '可开 YouTube 试用'],
  [/\bWith YouTube Trial\b/gi, '含 YouTube 试用'],
  [/\bNo YouTube Channel\b/gi, '无 YouTube 频道'],
  [/\bwith a Channel\b/gi, '带频道'],
  [/\bWith 2FA\b/gi, '带2FA验证'],
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
  [/\bEducation\b/gi, '教育版'],
  [/\bIndividual\b/gi, '个人版'],
  [/\bPersonal\b/gi, '个人版'],
  [/\bAll Apps\b/gi, '全家桶全套应用'],
  [/\bFresh Edu Mail\b/gi, '全新教育邮箱 (.edu)'],
  [/\bEmails Outlook\/hotmail\b/gi, 'Outlook / Hotmail 耐用邮箱账号'],
  [/\bOutlook mail\b/gi, 'Outlook 邮箱成品号'],
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
  [/\bCode\b/gi, '兑换码'],
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
  if (isMostlyChinese(trimmed)) return trimmed;

  let s = normalizeEnglishTitle(trimmed);
  for (const [re, replacement] of TITLE_PHRASE_RULES) {
    s = s.replace(re, replacement);
  }
  s = s
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

export function postProcessChineseText(zh: string): string {
  return (zh || '')
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
    .replace(/双重身份验证|双因素身份验证/g, '双重验证 (2FA)')
    .trim();
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
      zh: `📦 服务内容：${nameZh}\n⚡ 办理方式：付款核实后，请在订单详情页提交您本人的 SheerID 资格验证链接，供货商将为您完成认证。`,
      en: `📦 Service: ${nameEn}\n⚡ Fulfillment: After payment verification, submit your eligible SheerID verification link on the private order page for verification.`,
    };
  }
  const deliveryZh = requiresEmail
    ? '请在下单时填写需要开通服务的邮箱地址，核款后系统将为您发送激活链接或直接完成开通。'
    : delivery === 'instant'
      ? '付款核实后自动发卡，您可在私密订单页直接查看账号、卡密或兑换链接。'
      : '付款核实后由店铺为您安排交付，可在私密订单页实时查看交付进度与账号凭证。';
  const deliveryEn = requiresEmail
    ? 'Provide your activation email at checkout. Your subscription link or activation will be processed after payment confirmation.'
    : delivery === 'instant'
      ? 'Instant digital delivery after payment confirmation. View your credentials, key, or redeem link directly on your private order page.'
      : 'Fulfilled after payment confirmation. Track delivery status and access your credentials on your private order page.';

  return {
    zh: `📦 商品规格：${nameZh}\n⚡ 交付说明：${deliveryZh}\n🛡️ 售后须知：请仔细核对标题所示的有效期、设备数量及质保范围；如遇登录或激活问题，请保留订单号联系客服处理。`,
    en: `📦 Product: ${nameEn}\n⚡ Delivery: ${deliveryEn}\n🛡️ Warranty & Terms: Please review the duration, device limit, and warranty terms indicated in the title. Keep your order ID for customer support.`,
  };
}

export function translateDescriptionDeterministic(rawDesc: string, nameZh: string, delivery = 'instant', requiresEmail = false, inputKind = ''): string {
  const trimmed = (rawDesc || '').trim();
  if (!trimmed) {
    return generateFallbackDescription(nameZh, nameZh, delivery, requiresEmail, inputKind).zh;
  }
  if (isMostlyChinese(trimmed)) return trimmed;

  let s = trimmed
    .replace(/Format\s*:\s*email\s*\|\s*password\s*\|\s*token/gi, '交付格式：邮箱 | 密码 | 令牌 (Token)')
    .replace(/Format\s*:\s*email\s*\|\s*password/gi, '交付格式：邮箱 | 密码')
    .replace(/Mail\s*\|\s*Pass\s*\|\s*2FA/gi, '邮箱 | 密码 | 2FA双重验证密钥')
    .replace(/Email\s*\|\s*Password\s*\|\s*2FA/gi, '邮箱 | 密码 | 2FA双重验证密钥')
    .replace(/Email\s*\|\s*Pass\b/gi, '邮箱 | 密码')
    .replace(/email\s*\|\s*password/gi, '邮箱 | 密码')
    .replace(/username\s*\|\s*password\s*\|\s*2FA/gi, '用户名 | 密码 | 2FA双重验证密钥')
    .replace(/Full warranty for (\d+) (days?|months?|years?)/gi, '提供 $1 $2全程质保')
    .replace(/Full warranty/gi, '全程质保')
    .replace(/No warranty after activation/gi, '激活后无质保')
    .replace(/No warranty after redeem/gi, '兑换后无质保')
    .replace(/No warranty/gi, '无质保')
    .replace(/Login warranty only/gi, '仅保首次登录')
    .replace(/(\d+)-day warranty/gi, '$1天质保')
    .replace(/(\d+)-hour warranty/gi, '$1小时质保')
    .replace(/(\d+)-month warranty/gi, '$1个月质保')
    .replace(/100% private account/gi, '100% 独享账号')
    .replace(/FULL PRIVATE ACCOUNTS?/gi, '独享成品账号')
    .replace(/Ready account/gi, '成品账号');

  for (const [re, replacement] of TITLE_PHRASE_RULES) {
    s = s.replace(re, replacement);
  }
  return postProcessChineseText(s);
}

export async function googleTranslateToZh(text: string, timeoutMs = 6000, force = false): Promise<string> {
  const trimmed = (text || '').trim();
  if (!trimmed || (!force && isMostlyChinese(trimmed))) return trimmed;
  const prepared = trimmed
    .replace(/\bReady Personal Account\b/gi, '个人独享成品号')
    .replace(/\bPersonal Ready Account\b/gi, '个人独享成品号')
    .replace(/\bPrivate Ready Account\b/gi, '独享成品号')
    .replace(/\bReady Account\b/gi, '成品账号')
    .replace(/\bPrivate Account\b/gi, '独享账号')
    .replace(/\bShared Slot\b/gi, '共享车位')
    .replace(/\bFamily Slot\b/gi, '家庭组车位')
    .replace(/\bFull Warranty\b/gi, '全程质保')
    .replace(/\bNo Warranty\b/gi, '无质保')
    .replace(/\bLogin Warranty Only\b/gi, '仅保首次登录')
    .replace(/\bActivation Warranty\b/gi, '激活质保')
    .replace(/\bFW\b/g, '全程质保')
    .replace(/\bNW\b/g, '无质保');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(prepared)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as unknown[];
    const segments = Array.isArray(data?.[0]) ? (data[0] as unknown[][]) : [];
    const translated = segments.map(seg => (typeof seg?.[0] === 'string' ? seg[0] : '')).join('');
    return postProcessChineseText(translated || prepared);
  } catch {
    return translateDescriptionDeterministic(trimmed, '');
  } finally {
    clearTimeout(timer);
  }
}

export function localizeProductSync(input: {
  name: string;
  description?: string;
  delivery?: string;
  requiresEmail?: boolean;
  inputKind?: string;
}): { nameZh: string; nameEn: string; descZh: string; descEn: string } {
  const rawName = (input.name || '').trim();
  const rawDesc = (input.description || '').trim();
  const delivery = input.delivery || 'instant';
  const requiresEmail = !!input.requiresEmail;
  const inputKind = input.inputKind || '';

  const nameIsZh = isMostlyChinese(rawName);
  const nameEn = rawName;
  const nameZh = nameIsZh ? rawName : translateTitleDeterministic(rawName);

  if (!rawDesc) {
    const fb = generateFallbackDescription(nameEn, nameZh, delivery, requiresEmail, inputKind);
    return { nameZh, nameEn, descZh: fb.zh, descEn: fb.en };
  }

  const descIsZh = isMostlyChinese(rawDesc);
  if (descIsZh) {
    const fbEn = generateFallbackDescription(nameEn, nameZh, delivery, requiresEmail, inputKind).en;
    return { nameZh, nameEn, descZh: rawDesc, descEn: fbEn };
  }

  return {
    nameZh,
    nameEn,
    descZh: translateDescriptionDeterministic(rawDesc, nameZh, delivery, requiresEmail, inputKind),
    descEn: rawDesc,
  };
}
