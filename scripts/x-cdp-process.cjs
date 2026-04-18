const CDP_URL = process.env.CDP_URL || 'ws://127.0.0.1:18800/devtools/page/BA901C42EB127D1D6BE6282767233CFE';

const ws = new WebSocket(CDP_URL);

let msgId = 1;
const pending = {};
let tweets = [];

ws.onopen = () => {
  console.error('Connected to Chrome DevTools');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending[msg.id]) {
    const cb = pending[msg.id];
    delete pending[msg.id];
    if (msg.result && msg.result.result) {
      cb(null, msg.result.result);
    } else if (msg.result !== undefined) {
      cb(null, msg.result);
    } else {
      cb(null, msg);
    }
  } else if (msg.method) {
    handleEvent(msg.method, msg.params);
  }
};

ws.onerror = (e) => {
  console.error('WebSocket error:', e.message);
  process.exit(1);
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending[id] = (err, result) => {
      if (err) reject(err);
      else resolve(result);
    };
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function handleEvent(method, params) {
  if (method === 'Page.loadEventFired') {
    setTimeout(() => extractFullData(), 5000);
  }
}

async function extractFullData() {
  console.error('Extracting full tweet data...');
  try {
    const script = `
(() => {
  const tweets = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach((article) => {
    try {
      const textEl = article.querySelector('[data-testid="tweetText"]') || article.querySelector('div[lang]');
      const timeEl = article.querySelector('time');
      const linkEl = article.querySelector('a[href*="/status/"]');
      const repostEl = article.querySelector('[data-testid="socialContext"]');
      const imgEls = article.querySelectorAll('img[src*="pbs.twimg.com"]');
      const quotedEl = article.querySelector('a[href*="/status/"][role="link"]');
      
      // Get the actual status URL
      let statusUrl = '';
      const allLinks = article.querySelectorAll('a[href]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (href && href.includes('/status/') && !href.includes('/photo/') && !href.includes('/video/')) {
          statusUrl = 'https://x.com' + href;
          break;
        }
      }
      
      tweets.push({
        text: textEl ? textEl.innerText : '',
        time: timeEl ? timeEl.getAttribute('datetime') || timeEl.innerText : '',
        url: statusUrl,
        isRepost: !!repostEl && (repostEl.innerText.includes('reposted') || repostEl.innerText.includes('Reposted')),
        images: Array.from(imgEls).map(img => img.src).filter((src, i, arr) => arr.indexOf(src) === i) // dedupe
      });
    } catch(e) { console.error('Tweet error:', e.message); }
  });
  return JSON.stringify(tweets);
})()
`;
    const result = await send('Runtime.evaluate', {
      expression: script,
      returnByValue: true
    });
    tweets = JSON.parse(result.value || '[]');
    console.log(JSON.stringify(tweets, null, 2));
  } catch(e) {
    console.error('Extract error:', e);
  }
  ws.close();
  process.exit(0);
}

// Start extraction on the existing page
setTimeout(() => extractFullData(), 2000);
