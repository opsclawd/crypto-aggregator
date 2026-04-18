#!/usr/bin/env node
const CDP_PORT = 9222;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pages = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
  
  // Find the X tab that's already logged in
  const xTab = pages.find(p => p.url && p.url.includes('x.com') && p.type === 'page');
  if (!xTab) {
    console.error('No X tab found');
    process.exit(1);
  }
  
  console.error(`Using tab: ${xTab.id} - ${xTab.url}`);
  
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
  
  await cdpCall('Page.enable');
  await cdpCall('Network.enable');
  
  // Check if we're logged in first
  const checkAuth = await cdpCall('Runtime.evaluate', {
    expression: 'document.title + " | " + location.href + " | " + (document.querySelector(\'[data-testid="SideNav_NewTweet_Button"]\') ? "LOGGED_IN" : "NOT_LOGGED_IN")',
    returnByValue: true
  });
  console.error('Auth check:', checkAuth.result?.value);
  
  // Navigate to the list page
  console.error('Navigating to list...');
  await cdpCall('Page.navigate', { url: 'https://x.com/i/lists/1527662728176734208' });
  await sleep(10000);
  
  // Check what we got
  const pageInfo = await cdpCall('Runtime.evaluate', {
    expression: 'JSON.stringify({ title: document.title, url: location.href, bodyLen: document.body?.innerText?.length || 0 })',
    returnByValue: true
  });
  console.error('After nav:', pageInfo.result?.value);
  
  // Check for tweet articles
  const articleCount = await cdpCall('Runtime.evaluate', {
    expression: 'document.querySelectorAll(\'article[data-testid="tweet"]\').length',
    returnByValue: true
  });
  console.error('Article count:', articleCount.result?.value);
  
  // Also check what's actually visible
  const pageText = await cdpCall('Runtime.evaluate', {
    expression: 'document.body.innerText.substring(0, 1000)',
    returnByValue: true
  });
  console.error('Page text:', pageText.result?.value?.substring(0, 500));
  
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });