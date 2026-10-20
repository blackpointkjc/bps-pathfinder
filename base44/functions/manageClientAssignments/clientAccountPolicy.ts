// @ts-nocheck
const clean=value=>String(value||'').trim().toLowerCase();
export const isClientIdentity=person=>[].concat(person?.additional_roles||[]).map(clean).includes('client')||[person?.rank,person?.user_type,person?.account_type,person?.portal_type].some(value=>clean(value)==='client');
export const isClientOnly=person=>person?.role!=='admin'&&isClientIdentity(person)&&[].concat(person?.additional_roles||[]).map(clean).every(role=>role==='client');
export function clientOperationalPatch(person){
 if(!isClientOnly(person))return {};
 const values={additional_roles:['client'],rank:'Client',unit_number:'',badge_number:'',platoon:'',oversight_platoon:'',division:'',subdivision:'',supervisor_id:'',supervisor_email:'',supervisor_name:'',next_level_supervisor_id:'',next_level_supervisor_email:'',next_level_supervisor_name:'',dispatch_role:false,is_supervisor:false,show_on_map:false,status:'Out of Service',employment_status:'not_employee'};
 return Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(person[key])!==JSON.stringify(value)));
}
