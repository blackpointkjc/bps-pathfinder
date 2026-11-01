const IA_TOOLS:Record<string,string>={AdminComplaints:'complaints',AdminCommendations:'commendations',AdminConfidentialReports:'confidential',AdminPerformanceReviews:'reviews',AdminSupervisorReports:'approvals',SupervisorInspections:'inspections',SupervisorPerformanceReview:'supervisorReviews',SupervisorWriteUps:'writeups',SupervisorUseOfForce:'force',SupervisorComplaints:'supervisorComplaints',ConfidentialReport:'report',OfficerPerformanceReviews:'myreviews'};
export function createPageUrl(pageName:string){
 const [page,query='']=pageName.split('?');
 if(IA_TOOLS[page])return '/ProfessionalStandards?section='+IA_TOOLS[page];
 if(page==='AdminReports'){
  const params=new URLSearchParams(query),old=params.get('report_view')||params.get('admin_reports_quality_tool')||'';
  const destination:Record<string,string>={supervisorreports:'approvals',confidential:'confidential',complaints:'complaints',commendations:'commendations'};
  if(destination[old])return '/ProfessionalStandards?section='+destination[old];
 }
 return '/'+pageName.replace(/ /g,'-');
}
