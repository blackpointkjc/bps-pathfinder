const reads=new Set(['list','reports','get','officer_directory','training_options','client_referrals','notifications','audit_history','officer_file','evidence_storage_status']);
export function isIaRead(payload={}){
 const action=String(payload.action||'').toLowerCase();
 if(action==='legacy_entity')return ['list','filter','get'].includes(String(payload.method||'').toLowerCase());
 return reads.has(action);
}
export function iaReadCacheMs(action){return ['officer_directory','training_options'].includes(action)?60000:['audit_history','officer_file'].includes(action)?0:12000;}
