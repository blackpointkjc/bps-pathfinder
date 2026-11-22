import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/pages/RecordsAssistant.jsx','utf8');
const handler=source.slice(source.indexOf('const runSearch=async'),source.indexOf(' const openRecord=async'));
for(const rows of [[{id:'one',entity:'IncidentReport',label:'IR-1'}],[]]){
 const spoken=[];
 const env={query:'example',clean:v=>String(v).trim(),latest:{current:0},installVoiceUnlockListeners:()=>{},withSearchDeadline:p=>p,
 searchAllRecords:async(_payload,{onProgress})=>{for(let i=1;i<=3;i++)onProgress({results:rows,source:i,total_sources:3});return {results:rows,total_matches:rows.length};},
 base44:{functions:{invoke:async()=>({data:{matches:[]}})}},announceRecordSearch:results=>spoken.push(results),announceVoice:text=>spoken.push(text)};
 for(const name of ['Searching','Searched','Error','Partial','SourceFilter','Results','Residents','Progress','Count','SearchedText'])env['set'+name]=()=>{};
 const run=Function(...Object.keys(env),handler+';return runSearch;')(...Object.values(env));
 await run({preventDefault(){}});
 assert.equal(spoken.length,1,'multiple progress batches must produce exactly one completion announcement');
 assert.deepEqual(spoken[0],rows);
}
const voice=fs.readFileSync('src/utils/voiceAnnouncer.js','utf8');
const fn=voice.slice(voice.indexOf('export function announceRecordSearch(')).replace('export function','function');
const say=Function('announceVoice',fn+';return announceRecordSearch;')(text=>text);
assert.match(say([]),/No matching records/);
assert.doesNotMatch(say([],{partial:true}),/unavailable|Partial records/);
console.log('PASS search speech: three batches announce once; empty results announce once; unavailable-source wording removed');
