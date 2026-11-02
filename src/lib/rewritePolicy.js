export const LOCAL_REWRITE_MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
export function rewriteMessages(text){
 const facts=[...(String(text).matchAll(/\b\d+(?:[.:/-]\d+)*\b/g))].map(v=>v[0]);
 return [
  {role:'system',content:'Polish grammar and tone only. Make the draft professional and respectful. Keep the original perspective, facts, names, numbers, units and quotations exactly the same. Do not add information, answer the writer, apologize or give advice. Return only the polished draft.'+(facts.length?' Preserve these exact numbers: '+facts.join(', ')+'.':'')},
  {role:'user',content:text}
 ];
}
export function rewriteChunks(text,max=1100){
 const paragraphs=String(text).trim().split(/\n\s*\n/),chunks=[];
 for(const paragraph of paragraphs){let remaining=paragraph.trim();while(remaining.length>max){let cut=remaining.lastIndexOf('. ',max);if(cut<max/3)cut=remaining.lastIndexOf(' ',max);if(cut<1)cut=max;else cut++;chunks.push(remaining.slice(0,cut).trim());remaining=remaining.slice(cut).trim();}if(remaining)chunks.push(remaining);}
 return chunks;
}
export function validateRewrite(original,result){
 const text=String(result||'').trim().replace(/^(?:here(?:'s| is) (?:a |the )?(?:professional |revised |rewritten )?(?:version|draft|rewrite)[^:\n]*:\s*)/i,'');
 if(!text)throw new Error('The local model returned no wording. Keep your draft and retry.');
 const numbers=v=>[...String(v).matchAll(/\b\d+(?:[.:/-]\d+)*\b/g)].map(v=>v[0]).sort().join('|');
 if(numbers(original)!==numbers(text))throw new Error('The rewrite changed a number or date. Your original draft is preserved; please retry.');
 const quotes=[...String(original).matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)].map(v=>v[1]||v[2]);
 if(quotes.some(v=>!text.includes(v)))throw new Error('The rewrite changed a quotation. Your draft is preserved; please retry.');
 return text;
}
