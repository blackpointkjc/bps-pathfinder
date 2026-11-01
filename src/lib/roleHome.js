import {hasIAAccess,hasWholeAppAccess} from './portalAccess';
const HOME={
 admin:{center:'admin',page:'AdminCenter',label:'Administration Main'},
 supervisor:{center:'supervisor',page:'SupervisorCenter',label:'Supervisor Main'},
 hr:{center:'hr',page:'HRCenter',label:'HR Main'},
 trainer:{center:'training',page:'TrainerCenter',label:'Trainer Main'},
 accounting:{center:'accounting',page:'AccountingCenter',label:'Accounting Main'},
 officer:{center:'officer',page:'OfficerCenter',label:'Officer Main'},
 dispatch:{center:'cad',page:'CADCenter',label:'Dispatch Main'},
 support:{center:'support',page:'AdminSupportStaffClock',label:'Support Main'},
 ia:{center:'standards',page:'ProfessionalStandards',label:'Professional Standards Main'},
 student:{center:'student',page:'StudentPortal',label:'Student Main'},
 client:{center:'client',page:'ClientCenter',label:'Client Main'},
 visitor:{center:'visitor',page:'VisitorPortal',label:'Visitor Main'}
};
export function getRoleHome(user){
 const roles=new Set([user?.role,...(user?.additional_roles||[])].filter(Boolean).map(r=>String(r).trim().toLowerCase()));
 const rank=String(user?.rank||'').trim().toLowerCase().replace(/\./g,'').replace(/\s+/g,' ');
 if(user?.role==='admin'||hasWholeAppAccess(user))return HOME.admin;
 if(roles.has('client')||user?.user_type==='client'||rank==='client')return HOME.client;
 if(roles.has('student')||user?.user_type==='student')return HOME.student;
 if(roles.has('visitor'))return HOME.visitor;
 if(roles.has('supervisor')||user?.is_supervisor===true||['corporal','sergeant','sgt','first sergeant','lieutenant','lt','lt colonel','lt col','lieutenant colonel','captain','major','colonel'].includes(rank))return HOME.supervisor;
 if(roles.has('hr')||rank==='human resources')return HOME.hr;
 if(roles.has('trainer'))return HOME.trainer;
 if(roles.has('accounting'))return HOME.accounting;
 if(roles.has('officer'))return HOME.officer;
 if(roles.has('dispatch')||roles.has('cad_access')||user?.dispatch_role===true)return HOME.dispatch;
 if(roles.has('support')||roles.has('support_staff')||rank==='support staff')return HOME.support;
 if(hasIAAccess(user))return HOME.ia;
 return HOME.officer;
}
