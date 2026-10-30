/** Strict client-side CSV reader for lease/vehicle bulk intake. Quoted multiline
 * values and doubled quotes work. The backend revalidates every mapped field. */
export function parseCsvCells(text, maxRows=2000) {
 const raw=String(text||'').replace(/^\uFEFF/,'');
 if(raw.length>1_500_000)throw new Error('CSV is larger than 1.5 MB. Split it into smaller files.');
 const rows=[];let row=[],value='',quoted=false,afterQuote=false;
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(quoted){
   if(ch==='"'&&raw[i+1]==='"'){value+='"';i++;}
   else if(ch==='"'){quoted=false;afterQuote=true;}
   else value+=ch;
   continue;
  }
  if(ch==='"'&&!value.trim()&&!afterQuote){quoted=true;continue;}
  if(ch===','){row.push(value.trim());value='';afterQuote=false;continue;}
  if(ch==='\r'||ch==='\n'){
   if(ch==='\r'&&raw[i+1]==='\n')i++;
   row.push(value.trim());value='';afterQuote=false;
   if(row.some(cell=>cell!=='')){rows.push(row);if(rows.length>maxRows+1)throw new Error('Import exceeds 2,000 rows. Split the file.');}
   row=[];continue;
  }
  if(afterQuote&&ch!==' '&&ch!=='\t')throw new Error('Invalid CSV quote: use doubled quotation marks inside quoted values.');
  value+=ch;
 }
 if(quoted)throw new Error('CSV contains an unfinished quoted field.');
 row.push(value.trim());
 if(row.some(cell=>cell!==''))rows.push(row);
 return rows;
}
const normalize=value=>String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const aliases={
 full_name:['full_name','resident_name','resident','name','tenant_name','tenant','leaseholder_name','occupant_name'],
 first_name:['first_name','firstname','given_name'],last_name:['last_name','lastname','surname','family_name'],
 unit_number:['unit_number','unit','apartment','apartment_number','apt','apt_number','suite','door','unit_no'],
 site_name:['property','property_name','site','site_name','location'],
 building:['building','building_name','building_number'],lease_id:['lease_id','lease_number','lease_reference'],
 lease_status:['lease_status','occupancy_status','resident_status','status'],
 lease_start:['lease_start','lease_start_date','move_in','move_in_date'],lease_end:['lease_end','lease_end_date','move_out','move_out_date'],
 resident_type:['resident_type','household_role','occupant_type'],phone:['phone','phone_number','mobile','telephone'],
 email:['email','email_address'],notes:['notes','comments','memo'],
 vehicle_plate:['vehicle_plate','plate','license_plate','registration','plate_number'],
 vehicle_state:['vehicle_state','plate_state','license_state','registration_state','state'],
 vehicle_year:['vehicle_year','year'],vehicle_make:['vehicle_make','make'],vehicle_model:['vehicle_model','model'],
 vehicle_color:['vehicle_color','color','colour'],vehicle_vin:['vehicle_vin','vin'],
 permit_number:['permit_number','parking_permit','permit','permit_id'],permit_status:['permit_status','parking_permit_status'],
 monthly_rent:['monthly_rent','rent','rent_amount'],rent_due_day:['rent_due_day','due_day','rent_due_date_day'],
};
const nameLookup=new Map(Object.entries(aliases).flatMap(([canonical,values])=>values.map(x=>[normalize(x),canonical])));
const allowed=new Set(Object.keys(aliases));
export const RENT_ROLL_CSV_HEADERS=['full_name','unit_number','building','lease_status','lease_start','lease_end','phone','email','vehicle_plate','vehicle_state','vehicle_make','vehicle_model','vehicle_color','permit_number','permit_status','monthly_rent','rent_due_day'];
export function rentRollRowsFromText(input){
 const cells=parseCsvCells(input);
 if(!cells.length)return {rows:[],errors:['CSV / pasted list is empty'],headerDetected:false};
 const fields=cells[0].map(value=>nameLookup.get(normalize(value))||'');
 const recognized=fields.filter(Boolean).length;
 const headerDetected=recognized>=2 || (recognized===1&&fields.some(x=>x==='full_name'||x==='unit_number'));
 const headers=headerDetected?fields:['full_name','unit_number','vehicle_plate','vehicle_state','vehicle_make','vehicle_model'];
 const source=headerDetected?cells.slice(1):cells;
 const rows=[],errors=[];
 for(let i=0;i<source.length;i++){
  const entry=source[i];const line=i+(headerDetected?2:1);
  const record={};
  entry.forEach((cell,index)=>{const field=headers[index];if(field&&allowed.has(field)&&cell!=='')record[field]=cell});
  if(!record.full_name&&(record.first_name||record.last_name))record.full_name=[record.first_name,record.last_name].filter(Boolean).join(' ');
  delete record.first_name;delete record.last_name;
  if(!record.full_name||!record.unit_number){errors.push(`Row ${line}: resident name and apartment/unit are required`);continue;}
  if(record.lease_status){const lower=String(record.lease_status).toLowerCase();record.lease_status=['active','current','occupied'].includes(lower)?'active':
    ['former','inactive','vacated','moved_out'].includes(lower)?'former':
    ['pending','future'].includes(lower)?'pending':lower;}
  rows.push({...record,_source_row:line});
 }
 return {rows,errors,headerDetected};
}
