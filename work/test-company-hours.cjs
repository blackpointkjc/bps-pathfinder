const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/companyHours.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exports_,Date,Intl,Set,Map});
const officer={id:'officer',rank:'Lieutenant',last_name:'Example',email:'primary@test',email_aliases:['old@test']};
const hours=(entries,start='2026-10-20',end=start)=>exports_.calculateCompanyHours(entries,[officer],start,end)[0]||{regular:0,overtime:0,total:0};
const entry=(id,start,end,extra={})=>({id,officer_email:'old@test',clock_in:start,clock_out:end,...extra});
let rows=[
 entry('overnight','2026-10-20T23:00:00Z','2026-10-21T11:00:00Z',{break_periods:[{start:'2026-10-21T01:00:00Z',end:'2026-10-21T02:00:00Z'},{start:'2026-10-21T01:30:00Z',end:'2026-10-21T02:00:00Z'}]}),
 entry('archived','2026-10-20T12:00:00Z','2026-10-20T22:00:00Z',{archived:true})
];
assert.equal(hours(rows).total,4,'Eastern midnight clips overnight and overlapping break periods count once');
assert.equal(hours(rows,'2026-10-21').total,7,'remaining overnight hours land on correct Eastern day');
assert.equal(hours([...rows,rows[0],{...rows[0],id:'overlap'}],'2026-10-20','2026-10-21').total,11,'duplicate ids and overlapping paid punches cannot inflate hours');
rows=[0,1,2,3].map((n)=>entry('prior'+n,'2026-10-'+(16+n)+'T11:00:00Z','2026-10-'+(16+n)+'T21:00:00Z'));
rows.push(entry('period','2026-10-20T11:00:00Z','2026-10-20T19:00:00Z'));
assert.equal(hours(rows).regular,0);assert.equal(hours(rows).overtime,8,'earlier days in workweek establish overtime even when outside report period');
assert.equal(hours([entry('id','2026-10-20T11:00:00Z','2026-10-20T19:00:00Z',{officer_email:'unknown@test',officer_id:'officer'})]).total,8,'immutable officer identity resolves legacy email');
assert.equal(hours([entry('invalid','bad','bad')]).total,0);
assert.equal(hours([entry('dst','2026-11-01T04:00:00Z','2026-11-02T05:00:00Z')],'2026-11-01').total,25,'DST fallback day is 25 elapsed hours');
assert.equal(hours([entry('spring','2026-03-08T05:00:00Z','2026-03-09T04:00:00Z')],'2026-03-08').total,23,'DST spring day is 23 elapsed hours');
console.log('PASS: company hours Eastern dates, overnight clipping, aliases/IDs, archived and duplicate/overlapping punches, break union, prior-week overtime, and both DST transitions.');
