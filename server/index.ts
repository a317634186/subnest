import { createApp } from './app.js';
import { readConfig } from './config.js';
const config = readConfig();
const service = createApp(config);
async function syncAll() {
  for (const provider of service.catalog.providers.keys()) {
    if(provider==='prodseller'&&!service.catalog.prodsellerEnabled())continue;
    if(provider!=='prodseller'&&!service.store.get<{enabled:number}>('SELECT enabled FROM supplier_connections WHERE id=?',provider)?.enabled)continue;
    try { await service.catalog.sync(provider); } catch { console.error(`Catalog sync unavailable for ${provider}. Retry from the admin panel.`); }
  }
}
const server = service.app.listen(config.PORT, config.HOST, () => console.log(`SubNest running at ${config.APP_URL} (${config.PAYMENT_MODE})`));
// Serve the last saved catalog immediately even when an upstream is slow.
void syncAll();
let running = false;
const worker = setInterval(async () => {
  if (running) return; running = true;
  try { await service.orders.tick(); } catch { console.error('Order worker will retry on the next cycle.'); } finally { running = false; }
}, 15000);
worker.unref();
const sync = setInterval(() => { void syncAll(); }, config.CATALOG_SYNC_MINUTES * 60000);
sync.unref();
function stop() { clearInterval(worker); clearInterval(sync); server.close(() => { service.store.close(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
