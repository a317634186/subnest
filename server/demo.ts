import { AppError, type Supplier, type SupplierProduct, type SupplierOrder } from './types.js';
export const demoProducts: SupplierProduct[] = [
  { id: 'demo-chatgpt', name: 'ChatGPT Plus', description: '探索 AI 的更多可能。月度订阅方案，按购买邮箱开通。演示商品，实际权益以供应商说明为准。', price: 8.8, delivery: { type: 'custom' }, requiresEmailActivation: true, inStock: true },
  { id: 'demo-netflix', name: 'Netflix Premium', description: '把好故事带回家。30 天流媒体账号方案。演示商品，购买前请核对地区及设备限制。', price: 4.99, delivery: { type: 'instant' }, inStock: true, stock: 48 },
  { id: 'demo-spotify', name: 'Spotify Premium', description: '让音乐陪你多一会儿。30 天订阅方案，使用你提供的邮箱开通。演示商品。', price: 2.8, delivery: { type: 'custom' }, requiresEmailActivation: true, inStock: true },
  { id: 'demo-youtube', name: 'YouTube Premium', description: '视频与音乐，随心切换。月度邮箱激活方案。演示商品，请核对账号地区。', price: 3.5, delivery: { type: 'custom' }, requiresEmailActivation: true, inStock: true },
  { id: 'demo-canva', name: 'Canva Pro', description: '让每个灵感都有好设计。邮箱开通设计订阅。演示商品，实际期限以供应商说明为准。', price: 3.2, delivery: { type: 'custom' }, requiresEmailActivation: true, inStock: true },
  { id: 'demo-office', name: 'Microsoft 365', description: '工作、学习，更得心应手。数字激活码方案。演示商品，不提供真实软件授权。', price: 6.8, delivery: { type: 'instant' }, inStock: true, stock: 26 },
  { id: 'demo-disney', name: 'Disney+ Premium', description: '为日常加一点想象力。30 天账号方案。演示商品，请核对设备和地区限制。', price: 3.99, delivery: { type: 'instant' }, inStock: true, stock: 12 },
  { id: 'demo-notion', name: 'Notion AI', description: '整理想法，也整理生活。工作空间订阅方案。演示商品，暂时缺货。', price: 5.2, delivery: { type: 'custom' }, requiresEmailActivation: true, inStock: false },
];
export class DemoSupplier implements Supplier {
  async products() { return demoProducts; }
  async product(id: string) { const p = demoProducts.find(p => p.id === id); if (!p) throw new AppError(404, '商品不存在'); return p; }
  async balance() { return { balance: 1280.50, membership: 'demo' }; }
  async purchase(input: { productId: string; quantity: number; email?: string; emails?: string[] }, key: string): Promise<SupplierOrder> {
    const p = await this.product(input.productId);
    if (!p.inStock) throw new AppError(409, '商品暂时缺货');
    const id = `${p.requiresEmailActivation ? 'activation' : 'instant'}_${key}`;
    if (p.requiresEmailActivation) return { orderId: id, status: 'paid', activation: { emails: input.emails ?? [input.email!], eta: '约 15 秒 / about 15 seconds (demo)' }, activationInstructions: ['演示开通任务已收到，不会激活真实会员。 Demo activation received. No real subscription will be activated.'] };
    return { orderId: id, status: 'delivered', deliveredKeys: Array.from({ length: input.quantity }, (_, i) => `DEMO-ONLY-${key.slice(-8)}-${i + 1}`) };
  }
  async order(id: string): Promise<SupplierOrder> {
    return { orderId: id, status: 'delivered', activationInstructions: ['演示开通完成，无真实扣款或会员开通。 Demo complete. No real charge or subscription activation.'] };
  }
  async orders() { return { orders: [], pagination: { page: 1, pages: 0, total: 0 } }; }
}
