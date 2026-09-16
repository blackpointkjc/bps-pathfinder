export function withRequestTimeout(promise, milliseconds = 12000, label = 'Request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.ceil(milliseconds / 1000)} seconds`)), milliseconds);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
