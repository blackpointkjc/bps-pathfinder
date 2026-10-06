export function withRequestTimeout(promise, milliseconds = 12000, label = 'Request') {
  let timer;
  let settled = false;
  const timeout = new Promise((_, reject) => {
    const start = () => {
      if (settled) return;
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.ceil(milliseconds / 1000)} seconds`)), milliseconds);
    };
    // Queued SDK reads already have a bounded queue watchdog. A network timeout
    // must not expire while the request is waiting for a slot or API cooldown.
    if (promise?.base44RequestStarted) promise.base44RequestStarted.then(start);
    else start();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => { settled = true; clearTimeout(timer); });
}
