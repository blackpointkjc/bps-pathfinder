const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const HEADINGS=new Set(['site overview','jurisdiction patrol extension','jurisdiction and patrol extension','patrol schedule','patrol protocol','saturday patrol protocol','pre post procedures','patrol and post duties','duties and responsibilities','general duties','general patrol duties','armed officer protocol virginia dcjs certified','armed officer protocol','incident response','incident response and documentation','incident documentation','laundry room protocol','jurisdiction and conduct','firearm and use of force policy','conduct and appearance','operational duties','site operations reference','parking lot oversight','playground and green space monitoring','conduct and compliance','uniform and appearance','prohibited conduct','incident reporting','tow enforcement','primary post location','patrol responsibilities','emergency protocol']);
export function uniqueCompanySections(rows=[]){
 const seen=new Set();
 return rows.filter(row=>row.active!==false&&String(row.content||'').trim()).filter(row=>{
  const content=key(row.content);if(seen.has(content))return false;seen.add(content);return true;
 }).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
}
function importedSections(order){
 const fields=[['site location',order.site_address],['site location armstrong',order.site_address],['property management name',order.property_manager_name],['property manager',order.property_manager_name],['maintenance contact number',order.maintenance_contact],['contact number',order.property_manager_phone],['access code to law enforcement office',order.access_codes]];
 const text=String(order.special_instructions||'').replace(/^Site command contacts and acting coverage are provided by the live Site Chain of Command in Pathfinder\.\s*/i,'');
 const lines=text.split('\n').filter(line=>{
  const normalized=key(line);if(!normalized)return true;
  if(normalized===key(order.site_name))return false;
  if(/^(post orders:|.*[–—] (armed|unarmed) security coverage)/i.test(line.trim()))return false;
  return !fields.some(([label,value])=>value&&normalized.startsWith(label+' ')&&normalized.includes(key(value)));
 });
 const sections=[];let current={title:'Property instructions',content:''};
 for(const line of lines){
  if(HEADINGS.has(key(line))){
   if(current.content.trim())sections.push(current);
   current={title:line.replace(/:\s*$/,''),content:''};
  }else current.content+=(current.content?'\n':'')+line;
 }
 if(current.content.trim())sections.push(current);
 return sections;
}
export function postOrderSections(order={}){
 const fields=[['Site overview','site_overview'],['Patrol schedule','patrol_schedule'],['Patrol areas','patrol_areas'],['Special duties','special_duties']];
 const full=String(order.special_instructions||'');
 const imported=String(order.source_import_key||'').startsWith('black_point_handbook_2025_')||fields.filter(([,field])=>order[field]&&key(full).includes(key(order[field]))).length>=2;
 const sections=imported?importedSections(order):[];
 for(const [title,field]of fields){
  const content=String(order[field]||'').trim();if(!content)continue;
  if(sections.some(section=>key(section.content).includes(key(content))))continue;
  const existing=sections.find(section=>key(section.title)===key(title));
  if(existing)existing.content=content;else sections.push({title,content});
 }
 if(!imported&&full.trim())sections.push({title:'Additional instructions',content:full.trim()});
 const seen=new Set();
 return sections.filter(section=>{
  const content=key(section.content);if(!content||seen.has(content))return false;seen.add(content);return true;
 });
}
