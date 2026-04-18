#!/usr/bin/env node
const CDP_PORT = 9222;
const LIST_URL = 'https://x.com/i/lists/1527662728176734208';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Create a fresh tab specifically for scraping
  const target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(LIST_URL)}`, { method: 'PUT' }).then(r => r.json());
  console.error(`New tab: ${target.id}`);
  console.error(`WS URL: ${target.webSocketDebuggerUrl}`);
  
  if (!target.webSocketDebuggerUrl) {
    console.error('No WebSocket URL available');
    process.exit(1);
  }
  
  await sleep(10000); // Wait for page to load
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  
  let msgId = 1;
  const pending = new Map();
  
  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : (event.data?.toString?.() || '');
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  
  function cdpCall(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
      pending.set(id, { 
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  console.error('WS connected');
  
  // Enable Page and Network
  await cdpCall('Page.enable');
  console.error('Page enabled');
  
  // Wait more for dynamic content to load
  await sleep(5000);
  
  // Scroll to load more posts
  for (let i = 0; i < 5; i++) {
    await cdpCall('Runtime.evaluate', {
      expression: 'window.scrollBy(0, 1500)',
      returnByValue: true
    });
    await sleep(2000);
  }
  
  // Scroll back up
  await cdpCall('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 0)',
    returnByValue: true
  });
  await sleep(2000);
  
  // Extract posts
  const extractScript = `
    (function() {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const results = [];
      articles.forEach(article => {
        try {
          const timeEl = article.querySelector('time');
          const linkEl = timeEl ? timeEl.closest('a') : null;
          const postUrl = linkEl ? linkEl.href : null;
          
          const userDivs = article.querySelectorAll('div[data-testid="User-Name"]');
          let authorHandle = '';
          let displayName = '';
          
          if (userDivs.length > 0) {
            const userDiv = userDivs[0];
            const spans = userDiv.querySelectorAll('span');
            spans.forEach(sp => {
              const txt = sp.textContent.trim();
              if (txt.startsWith('@')) authorHandle = txt.substring(1);
            });
            const links = userDiv.querySelectorAll('a[role="link"]');
            for (const link of links) {
              const href = link.getAttribute('href') || '';
              if (href.startsWith('/') && !href.includes('/status/') && !displayName) {
                displayName = link.textContent.trim();
              }
            }
          }
          
          const textEl = article.querySelector('div[data-testid="tweetText"]');
          const rawText = textEl ? textEl.innerText : '';
          
          const postedAtText = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim()) : '';
          
          const socialContext = article.querySelector('div[data-testid="socialContext"]');
          const isRepost = !!socialContext;
          
          const quotedTweet = article.querySelector('div[data-testid="quoteTweet"] a[href*="/status/"]');
          const quotedPostUrl = quotedTweet ? quotedTweet.href : null;
          
          const images = article.querySelectorAll('img[src*="pbs.twimg.com/media/"]');
          const mediaUrls = Array.from(images).map(img => img.src);
          
          if (postUrl && rawText) {
            results.push({
              postUrl,
              authorHandle,
              displayName,
              rawText,
              postedAtText,
              isRepost,
              quotedPostUrl,
              mediaUrls
            });
          }
        } catch(e) {}
      });
      return JSON.stringify(results);
    })()
  `;
  
  const extractResult = await cdpCall('Runtime.evaluate', {
    expression: extractScript,
    returnByValue: true
  });
  
  const posts = JSON.parse(extractResult.result.value || '[]');
  console.log(JSON.stringify(posts, null, 2));
  console.error(`Extracted ${posts.length} posts`);
  
  // Close tab
  await cdpCall('Page.close');
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });