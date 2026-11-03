# 订阅集 SubNest

中英文数字会员、账号与卡密商城。React + TypeScript + Vite 前台，Node.js 24 + Express 后端，SQLite 持久化。对接 [ProdSeller API v1](https://prodseller.com/api-docs/)、[QuantumVault Store API](https://www.quantumvault.me/api-docs/) 和 [Pixel / SheerID 任务 API](https://api.smm.io.vn/api/v2/docs)，支持多个独立供货商以及自建商品与自营库存。

[在线商城](https://shop.example.com) · [管理后台](https://shop.example.com/#admin) · [源码仓库](https://github.com/a317634186/subnest)

**新安装默认使用演示模式。未连接真实 API Key 时，不会向 ProdSeller 采购或扣款。支付宝、微信、银行卡、币安使用人工核款，不冒充自动支付接口。**

## 快速启动

需要 Node.js 24 或更新版本。

```bash
git clone https://github.com/a317634186/subnest.git
cd subnest
npm ci
npm run setup
npm run build
npm start
```

- 商城：<http://localhost:4180>
- 商家后台：<http://localhost:4180/#admin>
- `npm run setup` 生成权限为 `0600` 的 `.env`，包含随机后台密码和数据加密密钥，不覆盖已有配置。管理员密码见 `.env` 中的 `ADMIN_PASSWORD`，没有通用默认密码。
- `.env`、数据库、交付内容和卡密均不进入 Git 或交付的源码包。
- 开发热更新：`npm run dev`，前台 <http://localhost:5180>，后端 4180。

## 已实现功能

| 模块 | 功能 |
| --- | --- |
| 商城 | 中英文切换、手机布局、商品搜索、分类筛选、价格排序、缺货状态、商品详情、按数量购买 |
| 订单 | 服务端计价、价格变更拦截、联系邮箱、每份商品独立开通邮箱、私密订单页、进度刷新 |
| 付款 | 支付宝 / 微信 / 银行卡 / 币安渠道开关、中英文收款说明、HTTPS 二维码图片地址、付款参考号、管理员核款 |
| 供应商 | 多供货商连接预设、加密密钥、商品同步、余额查询、采购和交付查询 |
| 自营商品 | 中英文名称/介绍、定价、分类、上下架、卡密批量导入、重复卡密过滤、库存自动发货、人工交付 |
| 后台 | 密码登录、12 小时 HttpOnly 会话、订单分页、收款确认、失败订单重试、营业统计 |
| 数据保护 | 交付内容/库存/邮箱 AES-256-GCM 加密、查询凭证哈希、权限校验、请求限流、跨站写入拦截 |

客户无需注册，通过“订单号:查询密钥”查询订单。浏览器保存最近 100 个凭证，“我的订单”显示最近 30 笔；可以复制凭证或下载 JSON 后在其他设备找回。**邮箱仅作为联系/开通信息，当前未配置自动发邮件服务。**

## 人工收款流程

1. 商家登录后台 → 收款设置，填写真实收款账号、收款人、金额/币种要求及中英文说明。需要时填写二维码图片的 HTTPS URL，再启用渠道。
2. 客户创建订单，按说明转账，填写交易号/转账参考号。此时仅进入“等待核款”，不会采购或消耗库存。
3. 商家在实际收款账户核对到账金额与交易号，在后台勾选“已核实到账”并确认。
4. API 商品使用商家的供应商余额采购；自营自动商品从库存发货；邮箱开通或自营人工商品等待处理。
5. 客户在私密订单页领取卡密/查看开通说明。人工商品在后台输入交付内容后完成交付。

币安转账需要在说明里明确 UID/地址、币种、网络和人民币换算方式。网站订单始终以 CNY 计价；没有自动汇率换算或到账检测。退款和实际退回资金由商家核对后在原收款渠道人工处理，当前没有自动退款接口。

## 接入真实 ProdSeller

推荐方式：登录商家后台 →「供应商连接」，从 ProdSeller 的 API Manager 生成 API Key，输入后点击「验证并连接」。系统只读取商品列表进行验证，不采购或扣款；成功后同步真实商品并切换为人工核款。密钥加密保存在数据库中，不会再次显示，也不会提交到 Git。请接着到「收款设置」启用渠道，并检查汇率、加价和商品售价。

也可以通过服务器 `.env` 配置并重启：

```dotenv
PRODSELLER_MODE=live
PRODSELLER_API_KEY=psk_your_key_here
PAYMENT_MODE=manual
USDT_CNY_RATE=7.2
MARKUP_PERCENT=25
CATALOG_SYNC_MINUTES=10
SUPPORT_EMAIL=your-support@example.com
```

汇率示例不是实时汇率，请自行确认和维护。默认售价 = `price × USDT_CNY_RATE × (1 + MARKUP_PERCENT / 100)`，向上取整到人民币分。使用文档定义的实际成本 `price`，而不是参考价格 `publicPrice`。后台编辑单品售价后，后续同步保留该售价及编辑过的中英文内容。

启动时和每 10 分钟同步商品；后台也可手动同步。商品已下架或不在供应商列表里时会标记缺货。供应商查询和采购仅在服务器执行，`X-API-Key` 不返回给前端。

付款确认后才采购；首次采购前核对最新成本/库存，成本上涨或库存不足会转为“店铺处理中”。网络超时可能已经扣款，重试使用固定 `subnest-<本地订单 UUID>` 幂等键；不会为同一订单换一个采购编号。明确的余额不足等失败会在重试前重新检查成本。失败后需商家检查原因再点击重试，避免不断重复请求。

接口适配器覆盖：

| ProdSeller API | 用途 |
| --- | --- |
| `GET /v1/products` | 商品与库存同步 |
| `GET /v1/products/:id` | 采购前成本/库存检查 |
| `GET /v1/balance` | 后台查询供应商余额 |
| `POST /v1/orders` | 核款后采购，传 `Idempotency-Key` |
| `GET /v1/orders/:id` | 后台任务和客户页面查询交付 |
| `GET /v1/orders` | 适配器提供分页历史方法，便于后续对账扩展；未将供应商全部订单暴露给客户 |

`requiresEmailActivation=true` 时，一份商品使用 `email`，多份使用与数量相同的 `emails` 数组。`paid`/`pending` 映射为等待交付；收到 `delivered` 才显示卡密。`activationInstructions` 只出现在授权订单页和商家后台。

供应商请求启动间隔为 3.3 秒，单进程低于文档的 300 次/15 分钟上限。生产部署保持一个实例；多实例需要共享限流与数据库任务协调，不应直接横向扩容当前 SQLite 版本。

## 只销售自己的商品

不需要 ProdSeller Key，使用：

```dotenv
PRODSELLER_MODE=demo
PAYMENT_MODE=manual
```

此组合会从客户商城隐藏演示供应商商品，只允许自营商品收款。

后台 → 商品与库存 → 添加商品：

- 自动交付：保存后点击“导入卡密”，每行一份完整卡密/账号交付内容。相同内容不会重复入库。库存由数据库事务分配，同一份卡密不会交付给两个订单。
- 人工交付：付款确认后等待商家在订单中填写交付内容。
- 若需要在指定邮箱开通，创建商品时勾选“需要开通邮箱”。

默认演示付款模式下，自营自动商品返回测试卡密，不消耗真实库存。真实运营请使用 `PAYMENT_MODE=manual`。不要把演示订单当作到账记录。

## 添加自定义供货商

后台 →「供应商连接」→「添加供货商」。可填写名称、HTTPS API 基础地址和 API Key；密钥以 AES-256-GCM 加密保存在服务器数据库，保存后不提供查看或回显。编辑时密钥留空表示保持不变。可以不启用、先保存不含密钥的连接预设。

- **QuantumVault 预设**：使用官方 `/api/v1` 商品、余额、采购和订单接口，支持商品规格和各商品动态交付字段。商品按 USD 成本乘店铺配置汇率和加价计算人民币售价。由于官方要求请求超时后不要重复购买，每个订单限购一件；超时后进入人工处理，商家应在供货商后台核对，并使用已有供货商订单号恢复交付。
- **Pixel / SheerID 预设**：同步三种 Pixel 和六种 SheerID 任务，按供货商 coins 成本、后台设置的人民币汇率及店铺加价计算。新任务默认下架，须在商品管理核对售价后逐个上架。任务默认进入独立的「账号与验证」分类。客户仅在商家核实付款后提交资料，并明确授权发送供货商；Pixel 需要本人 Gmail 密码和双重验证密钥，SheerID 需要本人且符合资格的验证链接。资料加密保存在订单中，成功提交或出现错误后清除；网络异常不重复提交，需核对已有任务号。
- **ProdSeller 兼容预设**：可自定义 HTTPS 基础地址、认证请求头/前缀及接口路径；接口的请求和响应数据结构需与 ProdSeller 一致。只有确认接口真正支持 `Idempotency-Key` 时才应勾选安全重试。未勾选时每次限购一件，遇到结果不明的采购不会重复请求。

每个供货商独立同步商品、查询余额和交付订单。停用后不再销售该供货商的商品，但已有订单仍可处理；有订单记录的供货商不能删除，未完成订单存在时不能更改接口或密钥。

新连接启用前仅使用只读商品接口验证，不会产生采购或扣款。只允许公网 HTTPS 域名和 443 端口；请求不跟随重定向，并对 DNS 解析结果进行公网检查。非上述预设数据协议的 API 需要按对方文档新增专门适配器；填写任意地址并不能保证兼容。

### 为新协议开发适配器

1. 在 `server/types.ts` 的 `Supplier` 接口基础上实现商品、详情、余额、采购和订单查询；将商品及交付字段规范化到平台结构。
2. 明确其重复请求与超时行为；对无幂等保证的接口设置 `supportsIdempotency=false`，不可盲目重试扣款请求。
3. 在 `server/custom-providers.ts` 的工厂注册适配器及配置验证，并在 `src/SupplierManager.tsx` 中增加预设。
4. 用模拟接口覆盖成功、库存不足、超时、重复采购保护、密钥加密和订单恢复；真实联调时先使用只读接口。

自动支付需另建支付适配器，并在验签成功、商户/金额/币种匹配的服务端回调内确认付款；浏览器的“支付成功”页面不能作为发货依据。

## 部署与数据

提供 `Dockerfile`、`compose.yaml`、`docs/nginx.conf.example` 和 `docs/subnest.service.example`。当前实例使用 `shop.example.com` 的 HTTPS 入口，由 `subnest.service` 开机启动。将 systemd 示例用于其他服务器时，按实际位置调整 `WorkingDirectory`、`ReadWritePaths` 和 Node/npm 路径；先创建数据目录再启动服务。

```bash
# 先 npm run setup 并填写 .env
docker compose up -d --build
```

Docker 服务只绑定宿主机 `127.0.0.1:4180`。对外域名使用 HTTPS 反向代理，设置：

```dotenv
APP_URL=https://shop.example.com
COOKIE_SECURE=true
TRUST_PROXY=1
```

后台连接的加密密钥优先于 `.env` 的供应商模式与密钥；它与数据库一起备份，解密依赖原有 `DATA_ENCRYPTION_KEY`。

`APP_URL` 必须与浏览器访问的来源完全一致，用于跨站请求校验。开发环境接受 localhost/127.0.0.1 的 4180/5180；生产环境请使用配置的 HTTPS 域名。

默认数据库 `data/store.sqlite`，Docker 则保存在 `store_data` 卷。备份时停止写入再备份整个数据目录，或使用 SQLite 在线备份接口，避免只复制正在写入的主文件而遗漏 WAL。**必须单独保存 `.env` 中的 `DATA_ENCRYPTION_KEY`**，丢失密钥后已保存的交付内容无法解密。不要随意重新生成该密钥。

当前产品边界：单商户、单管理员、单商品多数量订单；无购物车合并采购、用户注册系统、自动邮件、自动退款和自动支付网关。测试数据来自演示适配器；没有完成真实 API Key 和真实转账的联调。

## 验证

```bash
npm test
npm run build
npm run test:ui
```

浏览器测试默认使用 `/usr/bin/google-chrome`，其他系统可设置 `CHROME_PATH`。浏览器测试启动隔离的临时数据库和 4181 端口，不使用实际店铺订单。

- 后端测试覆盖计价、权限、人工付款门槛、幂等采购、超时重试、成本保护、开通邮箱、库存竞争、模式隔离、跨站拦截、供应商协议。
- 浏览器测试覆盖中英文、搜索分类、手机布局、下单/领取/找回、邮箱开通、后台核款、添加商品、导入库存、收款设置。

## Project map / English quick start

```text
src/                  Bilingual React storefront and admin interface
server/app.ts         Authenticated HTTP routes and provider registration
server/catalog.ts     Catalog sync, retail prices and own products
server/orders.ts      Payment and fulfillment state machine
server/supplier.ts    ProdSeller API adapter
server/quantumvault.ts QuantumVault API adapter
server/partner-jobs.ts Pixel / SheerID job adapter
server/custom-providers.ts Encrypted multi-supplier management
server/public-https.ts Public-only HTTPS and DNS validation
server/store.ts       SQLite storage and encryption
server/demo.ts        Clearly labeled mock supplier, no real purchases
tests/                Backend and browser checks
docs/                 Deployment example
```

Run `npm ci && npm run setup && npm run build && npm start` on Node 24+. Read `ADMIN_PASSWORD` from the generated `.env`, then open `http://localhost:4180/#admin`. English is available using the header language switch. Supplier product translations can be edited in the admin panel; original third-party descriptions are not machine-translated automatically.

Manual payment supports Alipay, WeChat, bank and Binance transfers. A customer payment claim never triggers delivery: an authenticated merchant must verify the actual funds. Live supplier operations require your own server-side API key and a funded ProdSeller balance. Demo checkout does not charge or activate real subscriptions.
