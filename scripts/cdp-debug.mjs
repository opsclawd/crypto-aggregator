#!/usr/bin/env node
const CDP_PORT = 9222;
const LIST_URL = 'https://x.com/i/lists/1527662728176734208';
const fs = await import('fs');
const path = await import('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Create a fresh tab
  const target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(LIST_URL)}`, { method: 'PUT' }).then(r => r.json());
  console.error(`Tab: ${target.id}`);
  
  await sleep(12000);
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  
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
  
  // Enable Page
  await cdpCall('Page.enable');
  
  // Get page title and URL first
  const info = await cdpCall('Runtime.evaluate', {
    expression: 'JSON.stringify({ title: document.title, url: location.href, bodyLen: document.body?.innerText?.length || 0, bodyPreview: document.body?.innerText?.substring(0, 2000) || "" })',
    returnByValue: true
  });
  console.error('Page info:', info.result?.value?.substring(0, 500));
  console.log('PAGE_INFO:', info.result?.value);
  
  // Take a screenshot
  await cdpCall('Page.enable');
  const screenshot = await cdpCall('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(screenshot.data, 'base64');
  fs.writeFileSync('/tmp/x-list-screenshot.png', buf);
  console.error('Screenshot saved to /tmp/x-list-screenshot.png');
  
  // Close tab
  try { await cdpCall('Page.close'); } catch {}
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });