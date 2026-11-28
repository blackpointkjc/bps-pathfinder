// Speech only: never change official identifiers in records, links or UI.
// Avoid the ISO currency token CAD, which some speech engines read as dollars.
const digitWords=['zero','one','two','three','four','five','six','seven','eight','nine'];
const spellReference=value=>Array.from(value).map(ch=>/\d/.test(ch)?digitWords[Number(ch)]:ch==='-'?'dash':ch==='/'?'slash':ch.toUpperCase()).join(' ');
export function formatCadReferenceForSpeech(text) {
  return String(text || '')
    // Retain the existing short BPS spoken-reference convention.
    .replace(/\bBPS-\d{6}-(\d+)\b/gi, (_,sequence)=>sequence)
    // Format identifiers only in explicit CAD/reference contexts, not addresses,
    // dates, priorities, prices or other numbers in the announcement.
    .replace(/\b(CAD(?:\s+(?:number|reference|ref))?|call\s+(?:number|reference))\s*[:#]?\s*((?:[A-Z]{0,12}\d[A-Z0-9]*(?:[-/][A-Z0-9]+)*))\b/gi, (_,label,reference)=>`${/^cad/i.test(label)?'C A D number':'Call reference'} ${spellReference(reference)}`)
    .replace(/\bCAD\b/gi,'C A D');
}
