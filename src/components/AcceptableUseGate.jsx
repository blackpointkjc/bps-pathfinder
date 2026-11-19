import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isClientAccount } from '@/lib/directoryUtils';
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

// A receipt is a local display optimization, never an authorization token.
// The server rechecks its authoritative acknowledgment on every new session.
// Cache is scoped to the exact employee, version, and account email; expired
// approvals cannot silently authorize a new policy version or different user.
const RECEIPT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const policyReceiptKey = user => `bps:accepted-policy:${AUP_VERSION}:${String(user?.id||'')}:${String(user?.email||'').trim().toLowerCase()}`;
const previouslyVerified = user => {
  try {
    const entry=JSON.parse(localStorage.getItem(policyReceiptKey(user))||'null');
    return entry?.version===AUP_VERSION && entry?.userId===user?.id &&
      Number.isFinite(Number(entry.verifiedAt)) && Date.now()-Number(entry.verifiedAt)<RECEIPT_MAX_AGE_MS;
  } catch { return false; }
};
const saveVerified = user => {
  try { localStorage.setItem(policyReceiptKey(user),JSON.stringify({version:AUP_VERSION,userId:user?.id,verifiedAt:Date.now()})); } catch {}
};
const forgetVerified = user => { try { localStorage.removeItem(policyReceiptKey(user)); } catch {} };
const POLICY_REQUEST_TIMEOUT_MS = 12_000;
const policyRequest = async (action,payload={}) => {
  let timer;
  try {
    return await Promise.race([
      base44.functions.invoke('acceptableUsePolicy',{action,...payload}),
      new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('Policy verification timed out. Pathfinder will retry.')),POLICY_REQUEST_TIMEOUT_MS); }),
    ]);
  } finally { clearTimeout(timer); }
};

export default function AcceptableUseGate({user,children}) {
  const client=useQueryClient();
  const exemptClient=isClientAccount(user);
  const [confirmed,setConfirmed]=useState(false);
  const [signature,setSignature]=useState('');
  const [cachedApproval,setCachedApproval]=useState(()=>previouslyVerified(user));
  const key=['acceptableUsePolicy',AUP_VERSION,user?.id,String(user?.email||'').toLowerCase()];
  // Query status in the background rather than forcing a full-screen spinner
  // through every route change, refresh or app deployment.
  const {data,isLoading,isError,error,refetch}=useQuery({
    queryKey:key,enabled:Boolean(user?.id)&&!exemptClient,
    queryFn:async()=>{
      const response=await policyRequest('status');
      const result=response?.data||response||{};
      if(result.error||result.policy_version!==AUP_VERSION || typeof result.accepted!=='boolean')
        throw new Error(result.error||'Policy verification did not return a valid acknowledgment.');
      return result;
    },
    staleTime:5*60_000,retry:1,retryDelay:1500,
    refetchInterval:10*60_000,refetchIntervalInBackground:false,
    refetchOnMount:false,refetchOnWindowFocus:false,refetchOnReconnect:true,
  });
  useEffect(()=>{setCachedApproval(previouslyVerified(user));},[user?.id,user?.email]);
  useEffect(()=>{
    if(!user?.id||!data)return;
    if(data.policy_version===AUP_VERSION && data.accepted===true){saveVerified(user);setCachedApproval(true);}
    else if(data.policy_version===AUP_VERSION && data.accepted===false){forgetVerified(user);setCachedApproval(false);}
  },[user?.id,user?.email,data?.accepted,data?.policy_version]);
  const accept=useMutation({
    mutationFn:async()=>{
      const response=await policyRequest('accept',{policy_version:AUP_VERSION,confirmed,signature});
      const result=response?.data||response||{};
      if(result.error||result.accepted!==true||result.policy_version!==AUP_VERSION)
        throw new Error(result.error||'The server did not confirm acknowledgment.');
      return result;
    },
    onSuccess:result=>{
      saveVerified(user);setCachedApproval(true);
      client.setQueryData(key,prev=>({...prev,accepted:true,policy_version:AUP_VERSION,accepted_at:result.accepted_at}));
    },
  });
  if(!user?.id||exemptClient)return children;
  // Server negative results always take precedence over the cached display
  // optimization, including if a policy receipt was revoked or reset.
  if(data?.accepted===true&&data?.policy_version===AUP_VERSION)return children;
  // Local approval only optimizes a slow lookup; an explicit authentication
  // denial still prevents access and requires a fresh authorized session.
  const authorizationDenied=isError && [401,403].includes(Number(error?.response?.status||error?.status));
  if(cachedApproval && (!data || (isError && !authorizationDenied))) return children;
  // Unknown/new employees see the agreement immediately, while status loads.
  // An already accepted employee will be dismissed as soon as the response lands.
  return <div className="fixed inset-0 z-[999999] flex items-center justify-center overflow-y-auto bg-[#030914] p-3 text-white sm:p-5" role="dialog" aria-modal="true" aria-label="Required Pathfinder user agreement">
    <div className="my-auto flex w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-[#315574] bg-[#091522] shadow-[0_30px_100px_rgba(0,0,0,.8)]">
      <header className="flex gap-4 border-b border-[#29435d] bg-[#10263d] p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-200"><ShieldCheck className="h-7 w-7"/></div><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Pathfinder · Required account acknowledgment</div><h1 className="mt-1 text-xl font-bold">Pathfinder Application User Agreement</h1><p className="mt-1 text-xs text-slate-300">Read and approve before continuing into your company account.</p></div></header>
      <><div className="max-h-[48dvh] overflow-y-auto px-5 py-5 sm:px-7"><div className="mb-4 flex justify-between gap-2 text-xs text-slate-400"><span>Employee agreement · Client Portal accounts exempt</span><span>Policy {data?.policy_version||AUP_VERSION}</span></div><AcceptableUsePolicyText/></div>
      <div className="space-y-3 border-t border-[#29435d] bg-[#0b1d30] p-5">
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-500"/><span>I have read the Pathfinder Application User Agreement, agree to follow its account, operational, confidentiality, security, and authorized-use requirements, and understand that violations may result in corrective or disciplinary action.</span></label>
        <label className="block text-xs font-bold text-slate-300">Electronic signature — type your full name<input value={signature} onChange={event=>setSignature(event.target.value)} maxLength={100} autoComplete="name" placeholder={data?.user_name||'First and last name'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white"/></label>
        {isError&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-700/50 bg-amber-950/35 p-3 text-xs text-amber-200"><span>{error?.message||'Policy verification unavailable. Your account remains protected until checked.'}</span><button type="button" onClick={()=>refetch()} className="rounded-md border border-amber-500/50 px-3 py-2 font-bold">Retry verification</button></div>}
        {isLoading&&!isError&&<div role="status" className="text-xs text-slate-400">Checking your existing approval in the background. You can read the agreement while it verifies.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4"/>Approval is saved to your account and visible in Admin Reports</span><button type="button" disabled={!confirmed||signature.trim().length<3||accept.isPending||isError||!data||data?.policy_version!==AUP_VERSION} onClick={()=>accept.mutate()} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-black text-white disabled:opacity-40">{accept.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<FileCheck2 className="h-4 w-4"/>}Accept & Continue</button></div>
        {accept.isError && <p className="text-xs text-red-300">{accept.error?.response?.data?.error||accept.error?.message||'Could not record acknowledgment.'}</p>}
      </div></>}
    </div>
  </div>;
}