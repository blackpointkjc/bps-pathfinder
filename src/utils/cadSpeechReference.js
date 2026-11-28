// Speech only: official identifiers in records and UI remain unchanged.
const digitWords=['zero','one','two','three','four','five','six','seven','eight','nine'];
const spellReference=value=>Array.from(value.replace(/,/g,'')).map(ch=>/\d/.test(ch)?digitWords[Number(ch)]:ch==='-'?'dash':ch==='/'?'slash':ch.toUpperCase()).join(' ');
export function formatCadReferenceForSpeech(text) {
  return String(text || '')
    // Retain the existing short BPS spoken reference convention.
    .replace(/\bBPS-\d{6}-(\d+)\b/gi, (_,sequence)=>sequence)
    .replace(/\bC[.\s]*A[.\s]*D\b\.?\s*(?:(?:number|reference|ref|no\.?)\s*)?[:#]?\s*([A-Z]{0,12}\d[A-Z0-9]*(?:[/-][A-Z0-9]+)*(?:,\d{3})*)\b/gi,(_,id)=>'see ay dee number '+spellReference(id))
    .replace(/\b([A-Z]{0,12}\d[A-Z0-9]*(?:[/-][A-Z0-9]+)*(?:,\d{3})*)\s+C[.\s]*A[.\s]*D\b\.?(?=\s|[,.!?;:]|$)/gi,(_,id)=>'see ay dee number '+spellReference(id))
    .replace(/\bcall\s+(?:number|reference|ref|no\.?)\s*[:#]?\s*([A-Z]{0,12}\d[A-Z0-9]*(?:[/-][A-Z0-9]+)*(?:,\d{3})*)\b/gi,(_,id)=>'Call reference '+spellReference(id))
    .replace(/\bC[.\s]*A[.\s]*D\b/gi,'see ay dee');
}
