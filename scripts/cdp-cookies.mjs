#!/usr/bin/env node
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pages = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
  const xTab = pages.find(p => p.url && p.url.includes('x.com') && p.type === 'page');
  if (!xTab) {
    console.error('No X tab found');
    process.exit(1);
  }
  
  const ws = new WebSocket(xTab.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  
  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : (event.data?.toString?.() || '');
    try {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    } catch(e) {}
  });
  
  function cdpCall(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve: (v) => { clearTimeout(timeout); resolve(v); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  await new Promise(r => { ws.addEventListener('open', r, { once: true }); });
  console.error('WS connected');
  
  // Get cookies for x.com
  const cookies = await cdpCall('Network.getCookies', { urls: ['https://x.com', 'https://twitter.com'] });
  const authCookies = cookies.cookies.filter(c => 
    ['auth_token', 'ct0', 'twid', 'kdt'].includes(c.name)
  );
  console.error('Auth cookies:', authCookies.map(c => `${c.name}=${c.value?.substring(0,10)}...`));
  console.error('Total x.com cookies:', cookies.cookies.length);
  console.error('All cookies:', JSON.stringify(cookies.cookies.map(c => `${c.name}=${c.value?.substring(0,20)}... domain=${c.domain}`), null, 2));
  
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });