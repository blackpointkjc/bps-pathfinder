let timer = null;
let intervalMs = 60000;

function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    self.postMessage({ type: 'tick', at: Date.now() });
  }, intervalMs);
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type === 'start') {
    intervalMs = Math.max(30000, Number(data.intervalMs) || 60000);
    schedule();
    self.postMessage({ type: 'tick', at: Date.now(), initial: true });
  } else if (data.type === 'ping') {
    self.postMessage({ type: 'tick', at: Date.now(), manual: true });
  } else if (data.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  }
};
