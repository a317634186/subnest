import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
async function buy(page:Page,name:string,activation=false){
  await page.locator('.product-card').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('button',{name:'选购',exact:true}).click();
  const modal=page.getByRole('dialog');await modal.getByLabel('联系邮箱',{exact:true}).fill('buyer@example.com');
  if(activation)await modal.getByRole('textbox',{name:'开通邮箱 1',exact:true}).fill('activate@example.com');
  await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'创建订单，前往付款'}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('订单详情');
}
async function login(page:Page){await page.goto('/#admin');await page.getByLabel('管理员密码').fill('e2e-test-password-not-for-production');await page.getByRole('button',{name:'进入管理后台'}).click();await expect(page.getByRole('heading',{name:'店铺管理'})).toBeVisible();}

test('storefront filters, bilingual navigation, responsive layout and browser errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');await expect(page.locator('.product-card')).toHaveCount(8);
  await page.getByRole('button',{name:'AI 工具',exact:true}).click();await expect(page.locator('.product-card')).toHaveCount(2);
  await page.getByRole('button',{name:'全部商品',exact:true}).click();await page.getByRole('textbox',{name:'搜索商品'}).fill('netflix');await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('textbox',{name:'搜索商品'}).clear();await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByRole('heading',{name:'Find your next favorite.'})).toBeVisible();
  await page.getByRole('button',{name:'中文',exact:true}).click();await page.getByText('购买后在哪里领取商品？',{exact:true}).click();await expect(page.locator('.faq-list details').first()).toHaveAttribute('open','');
  await page.locator('.faq-list summary').first().click();mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/store-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/store-mobile.png',fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#contact')).toContainText('support@example.com');await expect(page.locator('#contact')).toContainText('support_wechat');await expect(page.locator('#contact')).toContainText('t.me/support_contact');
  await page.getByRole('button',{name:'EN',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('customer can checkout, download recovery code, demo-pay and recover a private delivery',async({page})=>{
  await page.goto('/');await buy(page,'Netflix Premium');const modal=page.getByRole('dialog');const code=await modal.locator('.recovery-box code').innerText();
  const download=page.waitForEvent('download');await modal.getByRole('button',{name:'下载凭证'}).click();expect((await download).suggestedFilename()).toMatch(/^SubNest-/);
  await modal.getByRole('button',{name:'模拟付款成功'}).click();await expect(modal.getByText('你的商品已交付')).toBeVisible();await expect(modal.locator('.key-row')).toContainText('DEMO-ONLY');
  await modal.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('link',{name:'我的订单',exact:true}).click();await expect(page.locator('.order-list-item')).toHaveCount(1);
  await page.getByRole('textbox',{name:'订单查询凭证'}).fill(code);await page.getByRole('button',{name:'查询订单',exact:true}).click();await expect(page.getByRole('dialog').locator('.key-row')).toContainText('DEMO-ONLY');
});
test('email activation transitions from paid to delivered',async({page})=>{
  await page.goto('/');await buy(page,'ChatGPT Plus',true);const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'模拟付款成功'}).click();await expect(modal.locator('.status')).toContainText('等待开通');await expect(modal.locator('.status')).toContainText('交付完成',{timeout:30000});
});
test('admin can publish products, import inventory, configure payments and confirm a submitted payment',async({page})=>{
  await page.goto('/');await buy(page,'Microsoft 365');let modal=page.getByRole('dialog');await modal.getByRole('textbox',{name:'交易号 / 转账参考号'}).fill('E2E-TRANSFER-REFERENCE');await modal.getByRole('button',{name:'我已付款，提交核款'}).click();await expect(modal.locator('.status')).toContainText('等待核款');await modal.getByRole('button',{name:'关闭',exact:true}).click();
  await login(page);await page.getByRole('button',{name:'订单管理',exact:true}).click();await page.getByRole('row').filter({hasText:'Microsoft 365'}).getByRole('button',{name:'查看处理'}).click();modal=page.getByRole('dialog');await expect(modal).toContainText('E2E-TRANSFER-REFERENCE');await expect(modal.getByRole('button',{name:'确认到账并交付'})).toBeDisabled();await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'确认到账并交付'}).click();await expect(page.getByRole('row').filter({hasText:'Microsoft 365'})).toContainText('交付完成');
  await page.getByRole('button',{name:'商品与库存',exact:true}).click();await page.getByRole('button',{name:'添加商品',exact:true}).click();modal=page.getByRole('dialog');await modal.getByLabel('商品名称（中文）').fill('测试自营卡密');await modal.getByLabel('商品名称（英文）').fill('Test own license');await modal.getByLabel('商品说明（中文）').fill('这是测试商品');await modal.getByLabel('商品说明（英文）').fill('Test license');await modal.getByLabel('售价（人民币）').fill('19.90');await modal.getByRole('button',{name:'保存商品'}).click();
  const row=page.getByRole('row').filter({hasText:'测试自营卡密'});await expect(row).toContainText('¥19.90');await row.getByRole('button',{name:'导入卡密'}).click();modal=page.getByRole('dialog');await modal.locator('textarea').fill('TEST-KEY-ONE\nTEST-KEY-TWO\nTEST-KEY-ONE');await modal.getByRole('button',{name:'导入库存'}).click();await expect(row.getByRole('cell').nth(2)).toHaveText('2');
  await page.getByRole('button',{name:'收款设置',exact:true}).click();const channel=page.locator('.channel-form').filter({has:page.getByRole('heading',{name:'银行卡转账',exact:true})});await channel.getByLabel('收款说明（中文）').fill('测试收款说明，请勿转账');await channel.getByLabel('收款说明（英文）').fill('Test instructions. Do not send funds.');await channel.getByRole('checkbox').check();await channel.getByRole('button',{name:'保存设置'}).click();await expect(page.getByRole('status')).toContainText('收款设置已保存');
  await page.getByRole('button',{name:'经营概览',exact:true}).click();await page.screenshot({path:'artifacts/admin-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/');
  await page.getByRole('textbox',{name:'搜索商品'}).fill('测试自营');await expect(page.locator('.product-card')).toHaveCount(1);
});
test('admin can privately enter a supplier key through the connection form',async({page})=>{
  await login(page);await page.getByRole('button',{name:'供应商连接',exact:true}).click();const key=page.getByLabel('ProdSeller API Key');await expect(key).toHaveAttribute('type','password');
  let received='';await page.route('**/api/admin/providers/prodseller',async route=>{received=route.request().postDataJSON().apiKey;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,count:2})});});
  await key.fill('psk_fake_browser_test_key_123');await page.getByRole('button',{name:'验证并连接'}).click();await expect(page.getByRole('status')).toContainText('供应商已连接');await expect(key).toBeEmpty();expect(received).toBe('psk_fake_browser_test_key_123');
});
test('custom supplier preset keeps its API key hidden after saving',async({page})=>{
  let saved=false;let received='';const paths={products:'/products',product:'/products/{productId}',orders:'/orders',order:'/orders/{orderId}',balance:'/balance'};
  await page.route('**/api/admin/suppliers',async route=>{if(route.request().method()==='POST'){received=route.request().postDataJSON().apiKey;saved=true;await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'supplier-test',count:2})});}else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({suppliers:saved?[{id:'supplier-test',name:'Example Quantum',type:'quantumvault',baseUrl:'https://www.quantumvault.me/api/v1',authHeader:'X-API-Key',authPrefix:'',paths,enabled:true,supportsIdempotency:false,hasKey:true,pendingOrders:0}]:[]})});});
  await login(page);await page.getByRole('button',{name:'供应商连接',exact:true}).click();await page.getByRole('button',{name:'添加供货商'}).click();let modal=page.getByRole('dialog');await modal.getByLabel('供货商名称').fill('Example Quantum');await modal.getByLabel('接口预设').selectOption('quantumvault');const key=modal.getByLabel('API Key',{exact:true});await expect(key).toHaveAttribute('type','password');await key.fill('qv_fake_test_key_12345');await modal.getByRole('button',{name:'验证并保存'}).click();await expect(page.getByText('Example Quantum')).toBeVisible();expect(received).toBe('qv_fake_test_key_12345');await expect(page.locator('body')).not.toContainText(received);
  await page.getByRole('button',{name:'编辑连接'}).click();modal=page.getByRole('dialog');await expect(modal.getByLabel('API Key',{exact:true})).toHaveValue('');await expect(modal.getByLabel('API Key',{exact:true})).toHaveAttribute('placeholder',/已加密保存/);
});
test('Pixel task details are requested only after payment and are not echoed',async({page})=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const token='d'.repeat(64);let sent:Record<string,unknown>|undefined;
  await page.addInitScript(({id,token})=>localStorage.setItem('subnest-receipts',JSON.stringify([{id,token}])),{id,token});
  const baseOrder={id,productName:'Pixel test task',quantity:1,totalCents:1000,status:'awaiting_input',paymentStatus:'paid',paymentChannel:'alipay',demo:false,email:'buyer@example.com',activationEmails:[],paymentReference:'',keys:[],instructions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),inputKind:'pixel'};
  await page.route(`**/api/orders/${id}/service-input`,async route=>{sent=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...baseOrder,status:'activating'})});});
  await page.route(`**/api/orders/${id}`,async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(baseOrder)}));
  await page.goto('/#orders');await page.getByRole('button',{name:/Pixel test task/}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('heading',{name:'提交任务资料',exact:true})).toBeVisible();await modal.getByLabel('Gmail 地址').fill('owner@gmail.com');await modal.getByLabel('Gmail 密码').fill('TEST-PRIVATE-PASSWORD');await modal.getByLabel('双重验证密钥（32 位 Base32）').fill('B'.repeat(32));await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'提交资料并开始任务'}).click();await expect(modal.getByText('付款已确认，正在安排交付。页面每 15 秒更新一次。')).toBeVisible();assertObject(sent);await expect(modal).not.toContainText('TEST-PRIVATE-PASSWORD');expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('TEST-PRIVATE-PASSWORD');
});
function assertObject(value:Record<string,unknown>|undefined){expect(value?.serviceConsent).toBe(true);expect((value?.serviceInput as {kind:string}).kind).toBe('pixel');}
test('SheerID task asks for an eligible link after payment',async({page})=>{
  const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';const token='e'.repeat(64);let sent:Record<string,unknown>|undefined;const verification='https://services.sheerid.com/verify/example/?verificationId=demo123';
  await page.addInitScript(({id,token})=>localStorage.setItem('subnest-receipts',JSON.stringify([{id,token}])),{id,token});const order={id,productName:'SheerID test task',quantity:1,totalCents:1000,status:'awaiting_input',paymentStatus:'paid',paymentChannel:'alipay',demo:false,email:'buyer@example.com',activationEmails:[],paymentReference:'',keys:[],instructions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),inputKind:'sheerid'};
  await page.route(`**/api/orders/${id}/service-input`,async route=>{sent=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...order,status:'activating'})});});await page.route(`**/api/orders/${id}`,async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(order)}));
  await page.goto('/#orders');await page.getByRole('button',{name:/SheerID test task/}).click();const modal=page.getByRole('dialog');await modal.getByLabel('SheerID 验证链接').fill(verification);await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'提交资料并开始任务'}).click();await expect(modal.getByText('付款已确认，正在安排交付。页面每 15 秒更新一次。')).toBeVisible();expect(sent?.serviceConsent).toBe(true);expect((sent?.serviceInput as {kind:string}).kind).toBe('sheerid');
});
test('account service category groups Pixel and SheerID tasks',async({page})=>{
  const common={nameEn:'',description:'Test product',descriptionEn:'',brand:'generic',priceCents:1000,inStock:true,requiresEmail:false,delivery:'manual',demo:false,stock:null,maxQuantity:1};
  await page.route('**/api/products',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({products:[{...common,id:'pixel-1',name:'Pixel task',category:'services',inputKind:'pixel'},{...common,id:'sheer-1',name:'SheerID task',category:'services',inputKind:'sheerid'},{...common,id:'tool-1',name:'Other product',category:'tools',inputKind:''}]})}));
  await page.goto('/');await page.getByRole('button',{name:'账号与验证',exact:true}).click();await expect(page.locator('.product-card')).toHaveCount(2);await expect(page.getByRole('heading',{name:'Pixel task'})).toBeVisible();await expect(page.getByRole('heading',{name:'SheerID task'})).toBeVisible();await expect(page.getByRole('heading',{name:'Other product'})).toHaveCount(0);
});
test('admin can filter the large catalog to account and verification tasks',async({page})=>{
  const common={nameEn:'',description:'Test product',descriptionEn:'',brand:'generic',priceCents:1000,inStock:true,requiresEmail:false,delivery:'manual',demo:false,stock:null,maxQuantity:1,enabled:false,provider:'supplier-demo',providerName:'Partner',costUsdt:1};
  await page.route('**/api/admin/products',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({products:[{...common,id:'pixel-1',name:'Pixel task',category:'services',inputKind:'pixel'},{...common,id:'tool-1',name:'Other product',category:'tools',inputKind:''}]})}));
  await login(page);await page.getByRole('button',{name:'商品与库存',exact:true}).click();await page.getByLabel('后台商品分类').selectOption('services');await expect(page.getByRole('row').filter({hasText:'Pixel task'})).toBeVisible();await expect(page.getByRole('row').filter({hasText:'Other product'})).toHaveCount(0);await page.getByLabel('后台库存筛选').selectOption('in_stock');await expect(page.getByRole('row').filter({hasText:'Pixel task'})).toBeVisible();
  await page.getByLabel('后台库存筛选').selectOption('out_of_stock');await expect(page.getByRole('row').filter({hasText:'Pixel task'})).toHaveCount(0);
  await page.getByLabel('后台库存筛选').selectOption('all');
  await page.getByLabel('后台上架筛选').selectOption('disabled');await expect(page.getByRole('row').filter({hasText:'Pixel task'})).toBeVisible();
  await page.getByLabel('搜索后台商品').fill('does-not-exist');await expect(page.getByRole('row').filter({hasText:'Pixel task'})).toHaveCount(0);
});
