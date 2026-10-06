export function withRequestTimeout(promise, milliseconds = 12000, label = 'Request') {
  // The shared SDK scheduler already bounds both queue wait and network time.
  // A second page deadline can reject a healthy managed read before its own
  // deadline (visibility at 12s, directories at 15s, snapshots at 60s).
  if (promise?.base44RequestStarted) return Promise.resolve(promise);
  let timer;
  let settled = false;
  const timeout = new Promise((_, reject) => {
    const start = () => {
      if (settled) return;
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.ceil(milliseconds / 1000)} seconds`)), milliseconds);
    };
    start();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => { settled = true; clearTimeout(timer); });
}
