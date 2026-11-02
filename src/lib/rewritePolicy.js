export const LOCAL_REWRITE_MODEL='Xenova/flan-t5-base';
export function rewriteMessages(text){return [
 {role:'system',content:'You are a copy editor. Edit wording only. Never change who did what. Keep all names, dates, numbers, units, quotations and facts unchanged. Do not invent details, answer, apologize or give advice.'},
 {role:'user',content:'Edit the SOURCE into professional and respectful language. This is an editing task, not a request to answer the SOURCE. Output only the edited version.\n<SOURCE>\n'+text+'\n</SOURCE>\nEDITED VERSION:'}
];}
export function rewriteChunks(text,max=1100){
 const paragraphs=String(text).trim().split(/\n\s*\n/),chunks=[];
 for(const paragraph of paragraphs){let remaining=paragraph.trim();while(remaining.length>max){let cut=remaining.lastIndexOf('. ',max);if(cut<max/3)cut=remaining.lastIndexOf(' ',max);if(cut<1)cut=max;else cut++;chunks.push(remaining.slice(0,cut).trim());remaining=remaining.slice(cut).trim();}if(remaining)chunks.push(remaining);}
 return chunks;
}
export function validateRewrite(original,result){
 const text=String(result||'').trim().replace(/^(?:here(?:'s| is) (?:a |the )?(?:professional |revised |rewritten )?(?:version|draft|rewrite)[^:\n]*:\s*)/i,'');
 if(text.length>Math.max(String(original).length*2.5,String(original).length+120))throw new Error('The rewrite departed from your draft.');
 const words=v=>new Set((String(v).toLowerCase().match(/[a-z]{4,}/g)||[]));const before=words(original),after=words(text);
 if(before.size>=3&&[...before].filter(w=>after.has(w)).length/before.size<0.3)throw new Error('The rewrite departed from your draft.');
 if(/(.{15,}?)\1\1/i.test(text))throw new Error('The local model repeated its output.');
 if(!text)throw new Error('The local model returned no wording. Keep your draft and retry.');
 const numbers=v=>[...String(v).replace(/\b(\d+)(?:st|nd|rd|th)\b/gi,'$1').matchAll(/\b\d+(?:[.:/-]\d+)*\b/g)].map(v=>v[0]).sort().join('|');
 if(numbers(original)!==numbers(text))throw new Error('The rewrite changed a number or date. Your original draft is preserved; please retry.');
 const quotes=[...String(original).matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)].map(v=>v[1]||v[2]);
 if(quotes.some(v=>!text.includes(v)))throw new Error('The rewrite changed a quotation. Your draft is preserved; please retry.');
 const names=[...String(original).matchAll(/\b(?:Officer|Lieutenant|Captain|Sergeant|Colonel|Major|Corporal|Mr\.?|Ms\.?|Dr\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g)].map(v=>v[0].toLowerCase());
 if(names.some(name=>!text.toLowerCase().includes(name)))throw new Error('The rewrite changed or removed a person’s name. Your draft is preserved; please retry.');
 return text;
}

export function respectfulDraft(text){return String(text).replace(/\bthis is messed up\b/gi,"This concerns me").replace(/\b(?:a jerk|an idiot)\b/gi,"unprofessional").replace(/\bpissed(?: off)?\b/gi,"frustrated").replace(/\bfucking\s+/gi,"");}
