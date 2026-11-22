// Started team work satisfies the shared obligation; it remains visibly in progress.
export function workAsReports(rows=[]){
 return rows.filter(row=>row.status==='in_progress').map(row=>({...row,id:'team-work:'+row.id,status:'in_progress',team_work_session:true,created_by_id:row.officer_id,source_report_type:row.report_entity==='IncidentReport'?'incident_report':row.report_entity==='ShiftReport'?'shift_report':'daily_activity_report'}));
}
export async function loadReportWork(db,from,to){
 const rows=[];const query={status:'in_progress',report_date:{$gte:from,...(to?{$lte:to}:{})}};
 for(let skip=0;;skip+=500){const page=await db.TeamReportWork.filter(query,'id',500,skip);rows.push(...page);if(page.length<500)return workAsReports(rows);}
}
