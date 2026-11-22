import {useState} from 'react';
import {Shield} from 'lucide-react';
import {internalField,mediaField,mediaItems,officerDisplay,parsedValue,presentValue,reportLabel,reportReference,safeMediaUrl} from './reportPresentation';
import './officerRecordReport.css';
const narrativeKeys=new Set(['narrative','description','summary','statement_of_facts','facts_basis','details','report_text','notes','incident_summary','ai_summary','violation_description','disposition','findings','action_taken','actions_taken']);
const detailKeys=['incident','incident_type','call_type','status','priority','incident_date','report_date','notice_date','violation_date','offense_date','shift_date','date','time_received','location','site_name','property_name','address','unit_number','building','linked_call_number','call_number','call_id','case_number'];
const personKeys=['subject_name','person_name','full_name','first_name','middle_name','last_name','subject_dob','date_of_birth','subject_address','defendant_name','accused_name','resident_type','lease_status','phone','email','parties','suspects','victims','witnesses'];
const vehicleKeys=['vehicle_plate','license_plate','vehicle_state','vehicle_description','vehicle_make','vehicle_model','vehicle_year','vehicle_color','vehicle_vin','vin','vehicle_owner','vehicles'];
const omitted=new Set(['issued_by_name','issued_by','reporting_officer_name','officer_name','complainant_name','filed_by_name','primary_officer_name','report_number','notice_number','citation_number','complaint_number','summons_number','bolo_number','created_date','updated_date','source','label','record_kind','reporting_officer_email','officer_email','officer_badge']);
function Media({item}){const [failed,setFailed]=useState(false);if(/\.pdf(?:[?#]|$)/i.test(item.url))return <a href={item.url} target="_blank" rel="noreferrer">Open {item.label}</a>;return <figure>{failed?<p>Image could not load.</p>:<img src={item.url} alt={item.label} loading="lazy" onError={()=>setFailed(true)}/>}<figcaption>{item.label}</figcaption></figure>;}
function Value({value}){
 const v=parsedValue(value);
 if(Array.isArray(v))return <div className="officer-report-list">{v.filter(presentValue).map((item,i)=><div key={i}><Value value={item}/></div>)}</div>;
 if(v&&typeof v==='object')return <dl className="officer-report-nested">{Object.entries(v).filter(([key,item])=>!internalField(key)&&presentValue(item)).map(([key,item])=><div key={key}><dt>{reportLabel(key)}</dt><dd>{mediaField(key)?mediaItems(item,reportLabel(key)).map((media,i)=><Media key={i} item={media}/>):<Value value={item}/>}</dd></div>)}</dl>;
 if(typeof v==='boolean')return v?'Yes':'No';
 if(typeof v==='string'&&v.startsWith('data:'))return null;
 if(typeof v==='string'&&/^https?:\/\//i.test(v)&&safeMediaUrl(v))return <a href={v} target="_blank" rel="noreferrer">Open attachment</a>;
 return <span>{String(v??'—').replace(/_/g,' ')}</span>;
}
function Section({title,keys,record}){if(!keys.length)return null;return <section className="officer-report-section"><h3>{title}</h3><dl className="officer-report-fields">{keys.map(key=><div key={key}><dt>{reportLabel(key)}</dt><dd><Value value={record[key]}/></dd></div>)}</dl></section>;}
export default function OfficerRecordReport({record={},source='Officer report'}){
 const available=Object.keys(record).filter(key=>!internalField(key)&&!omitted.has(key)&&presentValue(record[key]));
 const select=list=>list.filter(key=>available.includes(key));
 const facts=select(detailKeys),people=select(personKeys),vehicles=select(vehicleKeys);
 const narratives=available.filter(key=>narrativeKeys.has(key));
 const used=new Set([...facts,...people,...vehicles,...narratives]);
 const photos=available.filter(mediaField).flatMap(key=>mediaItems(record[key],reportLabel(key)));
 const remaining=available.filter(key=>!used.has(key)&&!mediaField(key));
 return <article className="officer-record-report" aria-label="Officer report">
  <header className="officer-report-masthead"><Shield size={38} aria-hidden="true"/><div><p>BLACKPOINT PROTECTION</p><h2>{source}</h2><span>Pathfinder · Official company record</span></div></header>
  <div className="officer-report-heading"><div><span>Report / reference</span><strong>{reportReference(record)}</strong></div><div><span>Issued by</span><strong>{officerDisplay(record)}</strong>{record.officer_badge&&<small>Badge {record.officer_badge}</small>}</div></div>
  <Section title="Report information" keys={facts} record={record}/>
  <Section title="Persons involved" keys={people} record={record}/>
  <Section title="Vehicle information" keys={vehicles} record={record}/>
  {narratives.map(key=><section className="officer-report-section" key={key}><h3>{reportLabel(key)}</h3><div className="officer-report-narrative"><Value value={record[key]}/></div></section>)}
  <Section title="Additional report information" keys={remaining} record={record}/>
  {photos.length>0&&<section className="officer-report-section"><h3>Photographs & supporting documents</h3><div className="officer-report-photos">{photos.map((item,i)=><Media key={i} item={item}/>)}</div></section>}
  <footer><strong>Reporting officer: {officerDisplay(record)}</strong>{record.created_date&&<span>Recorded {new Date(record.created_date).toLocaleString('en-US',{timeZone:'America/New_York'})}</span>}<small>Internal historical record · Confirm current facts and legal status before enforcement action.</small></footer>
 </article>;
}
