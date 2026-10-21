const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/postOrderContent.js','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:exports_,Set});
const {postOrderSections,uniqueCompanySections}=exports_;
const fixture={site_name:'Example',source_import_key:'black_point_handbook_2025_example',site_overview:'A residential property overview.',patrol_schedule:'Complete an hourly patrol of all common areas.',special_instructions:'Site command contacts and acting coverage are provided by the live Site Chain of Command in Pathfinder.\nExample\nSite Overview\nA residential property overview.\nPatrol Schedule\nComplete an hourly patrol of all common areas.\nIncident Response\n● Notify command immediately for every life-threatening emergency.\n● Preserve evidence and complete the incident report.\nArmed Officer Protocol\n● Preserve evidence and complete the incident report.'};
let sections=postOrderSections(fixture);let text=sections.map(s=>s.content).join('\n');
assert.equal(text.split(fixture.site_overview).length-1,1);assert.equal(text.split(fixture.patrol_schedule).length-1,1);
assert.equal(text.split('Preserve evidence and complete the incident report.').length-1,1);assert(text.includes('life-threatening emergency'));
sections=postOrderSections({...fixture,site_overview:'Updated client-approved site overview.'});assert(sections.some(s=>s.content==='Updated client-approved site overview.'),'edited structured overview replaces stale imported overview');
assert.equal(uniqueCompanySections([{id:'a',active:true,content:'Universal conduct rules.'},{id:'b',active:true,content:'Universal  conduct rules.'},{id:'c',active:false,content:'Old rules.'},{id:'d',content:'Unique emergency plan.'}]).length,2);
const orders=JSON.parse(fs.readFileSync('work/post-order-content-fixtures.json','utf8'));
for(const order of orders){
 const sections=postOrderSections(order);assert(sections.length,order.site_name);
 const contents=sections.map(s=>s.content.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim());assert.equal(new Set(contents).size,contents.length,order.site_name+' duplicate sections');
 const all=sections.map(s=>s.content).join('\n');assert(!/virtus|centcom/i.test(all));
 if(order.special_instructions.includes('holstered'))assert(all.includes('holstered'),order.site_name+' retains firearm safety instructions');
 if(order.special_instructions.includes('911'))assert(all.includes('911'),order.site_name+' retains emergency instructions');
 if(order.site_name==='Oliver Crossing')assert(all.includes('Laundry Room Protocol')||sections.some(s=>s.title==='Laundry Room Protocol'),'site-specific laundry protocol retained');
}
console.log('PASS: 11 saved handbook records retain unique safety/site instructions without duplicate sections; overview/patrol appear once, repeated bullet removed, authored updates respected, company standards deduplicated and inactive versions hidden.');
