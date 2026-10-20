const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function load(path,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl,require:name=>imports[name]});return exports;}
const eastern=load('src/lib/easternTime.js'),m=load('src/lib/invoiceLocalTime.js',{'@/lib/easternTime':eastern});
const invoice={site_name:'Armstrong',shifts:JSON.stringify([{clockIn:'2026-10-19T00:00:00Z',clockOut:'2026-10-19T08:00:00Z',date:'2026-10-19',hours:'8.00',amount:'100.00'}])};
let rows=m.invoiceShiftRows(invoice,[{site_name:'Armstrong',time_zone:'America/New_York'}]);
assert(rows[0].clockIn.includes('8:00 PM'));assert(rows[0].clockOut.includes('4:00 AM'));assert(rows[0].date.includes('Oct 18'));assert(rows[0].clockIn.includes('EDT'));assert.equal(rows[0].amount,'100.00');
assert.equal(m.invoiceCalendarDate('2026-10-18'),'Oct 18, 2026','contract dates do not shift to previous day');
assert(m.invoiceLocalStamp('2026-12-01T00:00:00Z','America/New_York').includes('EST'));
assert.equal(m.invoiceTimeZone({site_name:'West'},[{site_name:'West',time_zone:'America/Los_Angeles'}]),'America/Los_Angeles');
assert(m.invoiceShiftRows({...invoice,time_zone:'America/Los_Angeles'})[0].clockIn.includes('5:00 PM'));
assert.equal(m.invoiceShiftRows({...invoice,shifts:'broken'}).length,0,'malformed historical line JSON cannot crash portal');
assert.equal(m.invoiceShiftRows({shifts:'[{"clockIn":"7:00 PM","date":"Oct 18, 2026"}]'})[0].clockIn,'7:00 PM','already formatted legacy time is preserved');
console.log('PASS: stored invoice timestamps use property timezone/DST, UTC-to-local date rollovers, date-only billing periods, original money preserved, other property zones and safe legacy/malformed rows.');
