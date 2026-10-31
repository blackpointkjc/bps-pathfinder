import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, FileCheck2, AlertTriangle, Loader2, LockKeyhole } from 'lucide-react';

export const AUP_VERSION = '2026-10-31-pathfinder-v2';
const sections = [
  {heading:'1. Scope and authorized access',text:'This agreement applies to the entire Pathfinder application and every connected company system available through it, including the CAD/dispatch center, GPS/navigation, patrol operations, personnel records, time and attendance, reports, scheduling, training, payroll and billing where authorized, messaging, and company files. Access is for approved company duties only. Features that are disabled by the company remain unavailable regardless of this acknowledgment.'},
  {heading:'2. Account security and permissions',text:'Use only your individually assigned account. Do not share logins, passwords, verification codes, sessions, devices, or access privileges. Do not use another employee account or attempt to bypass restrictions, access confidential material outside your assigned role, or restore disabled features. Report suspected compromise or unauthorized access to the help desk.'},
  {heading:'3. Operational integrity and officer safety',text:'Record truthful and timely CAD activities, patrol logs, GPS and location information, reports, calls for service, time entries, and other operational records. Never intentionally fabricate, alter, suppress, or delete records without authorization. Follow dispatch instructions, safety rules, company procedures, and applicable laws. Do not use Pathfinder in a way that distracts you from safe vehicle operation or an active response.'},
  {heading:'4. Confidentiality and communications',text:'Treat resident, client, personnel, financial, medical, incident, and operational information as confidential when applicable. Use approved company communication channels, share information only with authorized recipients, and protect attachments, photos, location data, and other company records. Do not export, photograph, publish, or disclose protected information without authorization.'},
  {heading:'5. Company systems and device security',text:'Use approved devices, software, network connections, and applications. Do not disable required security settings, add unauthorized integrations, introduce malware, bypass company access controls, or move company data to unapproved personal services. The optional Corporate Internet Browser is currently disabled and is not activated by this agreement.'},
  {heading:'6. Logging, audits and privacy',text:'Pathfinder may retain account sign-ins, operational edits, time records, CAD activity, GPS data when enabled, task actions, reports, acknowledgment receipts, and security events for legitimate operating, safety, compliance, and investigative purposes. Access to these records must follow company authorization and applicable law. This agreement does not claim monitoring of personal activity outside company-managed services.'},
  {heading:'7. Reporting concerns and corrective action',text:'Report safety risks, inaccurate records, suspected system failures, unauthorized disclosure, lost devices, and potential policy violations promptly through approved company channels. Violations may lead to restricted access, investigation, corrective action, discipline, suspension, or termination according to company procedures and applicable law. Automated alerts are subject to review and are not conclusive findings by themselves.'},
  {heading:'8. Electronic acknowledgment',text:'By signing, I acknowledge that I have read and understand the company-wide Pathfinder User Agreement, will use Pathfinder only as authorized, will protect company data and operational records, and understand that violations can result in corrective or disciplinary action. Future substantial policy updates may require a new acknowledgment.'}
];
export function AcceptableUsePolicyText(){return <div className="space-y-4">{sections.map(section=><section key={section.heading}><h3 className="font-bold text-slate-100">{section.heading}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{section.text}</p></section>)}</div>;}

export default function AcceptableUseGate({user,children}) {
  const client = useQueryClient();
  const [confirmed,setConfirmed] = useState(false);
  const [signature,setSignature] = useState('');
  // Include the current app-wide agreement version in the query identity so
  // cached approvals for an earlier agreement cannot bypass a new version.
  const key=['acceptableUsePolicy',AUP_VERSION,user?.id,String(user?.email||'').toLowerCase()];
  const {data, isLoading,isError,refetch} = useQuery({
    queryKey:key,enabled:Boolean(user?.id),queryFn:async()=> (await base44.functions.invoke('acceptableUsePolicy',{action:'status'})).data,
    staleTime:0,retry:1,refetchOnMount:'always',refetchOnWindowFocus:true
  });
  const accept=useMutation({
    mutationFn:async()=> (await base44.functions.invoke('acceptableUsePolicy',{action:'accept',policy_version:data?.policy_version,confirmed,signature})).data,
    onSuccess:result=>{if(result?.accepted && result?.policy_version===AUP_VERSION)client.setQueryData(key,prev=>({...prev,accepted:true,policy_version:AUP_VERSION,accepted_at:result.accepted_at}));}
  });
  if(!user?.id) return children;
  // A yes/no flag alone is insufficient: acceptances belong only to the
  // matching version of the full Pathfinder-wide agreement.
  if(data?.accepted===true && data?.policy_version===AUP_VERSION) return children;
  return <div className="fixed inset-0 z-[999999] flex items-center justify-center overflow-y-auto bg-[#030914] p-3 text-white sm:p-5" role="dialog" aria-modal="true" aria-label="Required Pathfinder user agreement">
    <div className="my-auto flex w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-[#315574] bg-[#091522] shadow-[0_30px_100px_rgba(0,0,0,.8)]">
      <header className="flex gap-4 border-b border-[#29435d] bg-[#10263d] p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-200"><ShieldCheck className="h-7 w-7"/></div><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Pathfinder · Required account acknowledgment</div><h1 className="mt-1 text-xl font-bold">Pathfinder Application User Agreement</h1><p className="mt-1 text-xs text-slate-300">Read and approve before continuing into your company account.</p></div></header>
      {isLoading?<div className="flex justify-center gap-2 p-12 text-slate-300"><Loader2 className="animate-spin"/>Checking policy acknowledgment…</div>
      :isError?<div className="space-y-3 p-6 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-amber-300"/><p>Policy verification is unavailable. For account security, access remains held until verification succeeds.</p><button type="button" onClick={()=>refetch()} className="rounded bg-blue-600 px-5 py-2">Retry verification</button></div>
      :<><div className="max-h-[48dvh] overflow-y-auto px-5 py-5 sm:px-7"><div className="mb-4 flex justify-between gap-2 text-xs text-slate-400"><span>Applies to all Pathfinder accounts and modules</span><span>Policy {data?.policy_version||AUP_VERSION}</span></div><AcceptableUsePolicyText/></div>
      <div className="space-y-3 border-t border-[#29435d] bg-[#0b1d30] p-5">
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-500"/><span>I have read the Pathfinder Application User Agreement, agree to follow its account, operational, confidentiality, security, and authorized-use requirements, and understand that violations may result in corrective or disciplinary action.</span></label>
        <label className="block text-xs font-bold text-slate-300">Electronic signature — type your full name<input value={signature} onChange={event=>setSignature(event.target.value)} maxLength={100} autoComplete="name" placeholder={data?.user_name||'First and last name'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white"/></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4"/>Approval is saved to your account and visible in Admin Reports</span><button type="button" disabled={!confirmed||signature.trim().length<3||accept.isPending||data?.policy_version!==AUP_VERSION} onClick={()=>accept.mutate()} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-black text-white disabled:opacity-40">{accept.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<FileCheck2 className="h-4 w-4"/>}Accept & Continue</button></div>
        {accept.isError && <p className="text-xs text-red-300">{accept.error?.response?.data?.error||accept.error?.message||'Could not record acknowledgment.'}</p>}
      </div></>}
    </div>
  </div>;
}