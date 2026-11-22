export const reportLabel=key=>({facts_basis:'Statement of facts',issued_by_name:'Issuing officer',reporting_officer_name:'Reporting officer',photo_urls:'Report photographs',id_photo:'Identification photograph',attached_officer_names:'Assisting officers'}[key]||String(key).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
export const internalField=key=>/^(id|_.*|app_id|created_by|updated_by|officer_ip_address|reporting_officer_signature|source_channel|match_context|entity|page)$/.test(key)||/_(?:id|ids|token|hash|ip_address)$/.test(key);
export const mediaField=key=>/(?:photo|image|signature|attachment)/i.test(key)&&!/(?:name|status|verified|count)/i.test(key);
export const safeMediaUrl=value=>typeof value==='string'&&(/^(?:https?:\/\/)/i.test(value)||/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(value))?value:'';
export function parsedValue(value){if(typeof value==='string'&&/^[\[{]/.test(value.trim())){try{return JSON.parse(value);}catch{}}return value;}
export function mediaItems(value,label='Photograph'){
 const items=[];
 const visit=(input,title)=>{const v=parsedValue(input);if(Array.isArray(v)){v.forEach((item,i)=>visit(item,title+' '+(i+1)));return;}if(v&&typeof v==='object'){const url=v.url||v.photo_url||v.image_url||v.src||v.file_url;if(url)visit(url,v.name||v.caption||title);else Object.entries(v).filter(([key])=>mediaField(key)).forEach(([key,item])=>visit(item,reportLabel(key)));return;}const url=safeMediaUrl(v);if(url)items.push({url,label:title});};
 visit(value,label);return items;
}
export const officerDisplay=record=>[record.issued_by_name,record.reporting_officer_name,record.officer_name,record.complainant_name,record.filed_by_name,record.primary_officer_name,record.issued_by].find(v=>typeof v==='string'&&v.trim()&&!/^[a-f\d]{20,32}$/i.test(v.trim())&&!/^[\w.+-]+@/.test(v))||'Not recorded';
export const reportReference=r=>r.report_number||r.notice_number||r.citation_number||r.complaint_number||r.summons_number||r.bolo_number||r.case_number||r.call_id||r.call_number||'Record';
export const presentValue=value=>!(typeof value==='string'&&/^[a-f\d]{20,32}$/i.test(value.trim()))&&value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0);
