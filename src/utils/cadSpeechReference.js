// Keep official CAD identifiers intact in records, call links, receipts, and UI.
// Only shorten the reference passed to text-to-speech.
export function formatCadReferenceForSpeech(text) {
  return String(text || '').replace(/\bBPS-\d{6}-(\d+)\b/gi, (_, sequence) => sequence);
}
