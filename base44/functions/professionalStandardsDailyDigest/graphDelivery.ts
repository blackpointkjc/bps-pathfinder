import {sendCompanyEmail} from '../../shared/companyGraph.ts';
export async function sendManagementEmail(base44,to,subject,body,html=false){return sendCompanyEmail({to,subject,body,html,from:'ia@blackpointkjc.com'});}
