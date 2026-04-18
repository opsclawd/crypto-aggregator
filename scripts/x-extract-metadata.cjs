const CDP_URL = process.env.CDP_URL || 'ws://127.0.0.1:18800/devtools/page/BA901C42EB127D1D6BE6282767233CFE';

const ws = new WebSocket(CDP_URL);

let msgId = 1;
const pending = {};

ws.onopen = () => {
  console.error('Connected');
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

async function getDisplayName() {
  const script = `
(() => {
  const nameEl = document.querySelector('[data-testid="UserName"] span') || 
                 document.querySelector('div[data-testid="UserName"] span') ||
                 document.querySelector('a[href="/Morecryptoonl"] span');
  return nameEl ? nameEl.innerText : 'More Crypto Online';
})()
`;
  const result = await send('Runtime.evaluate', { expression: script, returnByValue: true });
  console.log('DISPLAY_NAME:' + (result.value || 'More Crypto Online'));
  ws.close();
  process.exit(0);
}

setTimeout(() => getDisplayName(), 2000);
