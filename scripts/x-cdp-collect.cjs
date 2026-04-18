const CDP_URL = process.env.CDP_URL || 'ws://127.0.0.1:18800/devtools/page/02A8927DFA2EF8CCC2768D0EECB5939F';
const TARGET_URL = 'https://x.com/Morecryptoonl';

const ws = new WebSocket(CDP_URL);

let msgId = 1;
const pending = {};

ws.onopen = () => {
  console.error('Connected to Chrome DevTools');
  navigate(TARGET_URL);
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

let loadTimeout;
function handleEvent(method, params) {
  console.error('Event:', method);
  if (method === 'Page.loadEventFired' || method === 'Page.navigatedWithinDocument') {
    console.error('Page loaded, waiting for content...');
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(() => extractTweets(), 5000);
  }
  if (method === 'Page.frameStoppedLoading') {
    console.error('Frame stopped loading');
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(() => extractTweets(), 3000);
  }
}

async function navigate(url) {
  console.error('Navigating to:', url);
  try {
    const result = await send('Page.navigate', { url });
    console.error('Navigation result:', JSON.stringify(result));
    // Fallback timeout in case Page.loadEventFired doesn't fire
    loadTimeout = setTimeout(() => {
      console.error('Fallback timeout reached, extracting content...');
      extractTweets();
    }, 20000);
  } catch(e) {
    console.error('Nav error:', e);
  }
}

async function extractTweets() {
  console.error('Extracting tweets...');
  try {
    const script = `
(() => {
  const tweets = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach((article, i) => {
    try {
      const textEl = article.querySelector('[data-testid="tweetText"]') || article.querySelector('div[lang]');
      const timeEl = article.querySelector('time');
      const linkEl = article.querySelector('a[href*="/status/"]');
      const repostEl = article.querySelector('[data-testid="socialContext"]');
      const imgEls = article.querySelectorAll('img[src*="pbs.twimg.com"]');
      
      tweets.push({
        text: textEl ? textEl.innerText : '',
        time: timeEl ? timeEl.getAttribute('datetime') || timeEl.innerText : '',
        url: linkEl ? 'https://x.com' + linkEl.getAttribute('href') : '',
        isRepost: !!repostEl && repostEl.innerText.includes('reposted'),
        images: Array.from(imgEls).map(img => img.src)
      });
    } catch(e) {}
  });
  return JSON.stringify(tweets);
})()
`;
    const result = await send('Runtime.evaluate', {
      expression: script,
      returnByValue: true
    });
    console.log(result.value || result);
  } catch(e) {
    console.error('Extract error:', e);
  }
  ws.close();
  process.exit(0);
}
