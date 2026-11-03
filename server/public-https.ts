import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import ipaddr from 'ipaddr.js';
import { AppError } from './types.js';

type Address = { address: string; family: number };
export async function publicAddresses(hostname: string, resolver: (host: string) => Promise<Address[]> = host => lookup(host, { all: true, verbatim: true })) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(host) || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new AppError(400, '供应商地址必须使用公网 HTTPS 域名', 'UNSAFE_SUPPLIER_URL');
  let addresses: Address[]; let timer: ReturnType<typeof setTimeout> | undefined;
  try { addresses = await Promise.race([resolver(host), new Promise<never>((_, reject) => {timer=setTimeout(() => reject(new Error('DNS timeout')), 5000);timer.unref();})]); }
  catch { throw new AppError(502, '无法解析供应商域名，请检查地址', 'SUPPLIER_UNAVAILABLE'); }
  finally { if(timer)clearTimeout(timer); }
  if (!addresses.length || addresses.some(item => !ipaddr.isValid(item.address) || ipaddr.process(item.address).range() !== 'unicast')) throw new AppError(400, '供应商地址不能指向本机、内网或保留地址', 'UNSAFE_SUPPLIER_URL');
  return addresses;
}

// DNS is checked immediately before each request and pinned to the approved IP.
// Node's HTTPS client does not follow redirects, so the key never follows one.
export const publicHttpsFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new AppError(400, '供应商地址必须是公网 HTTPS 地址（443 端口）', 'UNSAFE_SUPPLIER_URL');
  const addresses = await publicAddresses(url.hostname);
  const target = addresses.find(a => a.family === 4) ?? addresses[0];
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  return await new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(url, {
      method: init.method ?? 'GET', headers, agent: false, family: target.family,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      timeout: 20000,
    }, response => {
      let total = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > 2 * 1024 * 1024) { req.destroy(new Error('response too large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const status = response.statusCode ?? 502;
        const body = [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status, headers: { 'Content-Type': response.headers['content-type'] ?? 'application/json' } }));
      });
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    const deadline=setTimeout(()=>req.destroy(new Error('request deadline')),20000);deadline.unref();req.on('close',()=>clearTimeout(deadline));
    if (init.body != null) {
      if (typeof init.body !== 'string') { req.destroy(new Error('invalid request body')); return; }
      req.write(init.body);
    }
    req.end();
  });
};
