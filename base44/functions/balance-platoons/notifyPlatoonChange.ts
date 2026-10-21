export async function notifyPlatoonChange(entities:any,before:any,after:any) {
 if(!after.email || (String(before.platoon||'')===String(after.platoon||'') && String(before.supervisor_id||'')===String(after.supervisor_id||'')))return;
 const event_key='platoon:'+after.id+':'+String(after.updated_date||new Date().toISOString())+':'+after.platoon+':'+after.supervisor_id;
 const existing=await entities.Notification.filter({event_key},'-created_date',1);
 if(existing.length)return;
 const command=after.supervisor_name||'Command staff';
 const message='Your platoon assignment has been updated from '+(before.platoon||'Unassigned')+' to Platoon '+(after.platoon||'Unassigned')+'. Your reporting command is '+command+'. Call and report to your new command for instructions.';
 await entities.Notification.create({recipient_email:after.email,type:'system_issue',title:'Platoon / command reassignment',message,related_id:after.id,priority:'high',is_read:false,requires_acknowledgment:true,source_name:'Platoon Command',event_key,announcement_text:message});
}
