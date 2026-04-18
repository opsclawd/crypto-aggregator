const WebSocket = require('ws');

const WS_URL = 'ws://127.0.0.1:9222/devtools/page/A57BB6A2F62442E8AB670DA38B6F1BA2';
const LIST_URL = 'https://x.com/i/lists/1527662728176734208';

const ws = new WebSocket(WS_URL);

let msgId = 1;
const pending = {};

ws.on('open', () => {
  console.error('Connected to Chrome DevTools');
  navigate(LIST_URL);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id && pending[msg.id]) {
    const cb = pending[msg.id];
    delete pending[msg.id];
    if (msg.result && msg.result.result) {
      cb(null, msg.result.result);
    } else if (msg.result) {
      cb(null, msg.result);
    } else if (msg.params && msg.params.method) {
      // event
      cb(null, { type: 'event', method: msg.params.method, params: msg.params.params });
    } else {
      cb(null, msg);
    }
  } else if (msg.method) {
    // unsolicited event
    handleEvent(msg.method, msg.params);
  }
});

ws.on('error', (e) => {
  console.error('WebSocket error:', e.message);
  process.exit(1);
});

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
    console.error('Page loaded');
    setTimeout(() => getContent(), 3000);
  }
}

async function navigate(url) {
  console.error('Navigating to:', url);
  try {
    await send('Page.navigate', { url });
    console.error('Navigation command sent');
  } catch(e) {
    console.error('Nav error:', e);
  }
}

async function getContent() {
  console.error('Getting page content...');
  try {
    const result = await send('Runtime.evaluate', {
      expression: `document.body.innerText.substring(0, 5000)`,
      returnByValue: true
    });
    console.log(result.value || result);
  } catch(e) {
    console.error('Content error:', e);
  }
  ws.close();
  process.exit(0);
}
