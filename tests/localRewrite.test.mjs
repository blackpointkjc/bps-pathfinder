import assert from 'node:assert/strict';import fs from 'node:fs';
import{rewriteChunks,validateRewrite,rewriteMessages,LOCAL_REWRITE_MODEL}from'../src/lib/rewritePolicy.js';
assert.ok(LOCAL_REWRITE_MODEL==='Xenova/flan-t5-base');assert.ok(rewriteMessages('draft')[1].content.includes('<SOURCE>'));
assert.equal(validateRewrite('Officer Jones waited 45 minutes on October 30.','Officer Jones waited for 45 minutes on October 30th.'),'Officer Jones waited for 45 minutes on October 30th.');
assert.throws(()=>validateRewrite('Officer Jones waited 45 minutes.','Officer Jones waited 4 hours.'),/number/);
assert.throws(()=>validateRewrite('Officer Jones was rude.','I was rude.'),/name/);
assert.throws(()=>validateRewrite('The officer said "Go away".','The officer said "Leave".'),/quotation/);
const long='A factual statement. '.repeat(200);const chunks=rewriteChunks(long);assert.ok(chunks.length>1);assert.equal(chunks.join(' ').replace(/\s+/g,' ').trim(),long.trim());
for(const path of ['src/lib/localRewrite.js','src/lib/localRewrite.worker.js','src/components/AIRewriteField.jsx']){const source=fs.readFileSync(path,'utf8');assert.equal(/InvokeLLM|Core\.SendEmail|rewriteProfessionalText|functions\.invoke/.test(source),false,path);}
assert.ok(fs.readFileSync('src/components/AIRewriteField.jsx','utf8').includes('setCustomValidity'));assert.ok(fs.readFileSync('src/components/AIRewriteField.jsx','utf8').includes('Use this rewrite'));
assert.throws(()=>validateRewrite('I need assistance at the front gate.','IDA passant Ofert rainbow résolution '.repeat(30)),/departed|repeated/);
console.log('PASS: local model policy, chunk preservation, number/date/name/quotation checks, mandatory review, and zero Base44 inference calls.');
