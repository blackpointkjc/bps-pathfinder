import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, FileCheck2, AlertTriangle, Loader2, LockKeyhole } from 'lucide-react';

export const AUP_VERSION = '2026-10-31-v1';
const sections = [
  {heading:'1. Authorized business use',text:'Pathfinder, company computers, networks, email, records, and the Corporate Internet Browser are provided for authorized company duties, education, support, emergency response, and approved business research. Use only your assigned account. Protect company information and credentials.'},
  {heading:'2. Prohibited websites and activities',text:'Unless explicitly authorized by company policy, do not access social networking, YouTube, video or music streaming, adult or sexually explicit websites, dating, gambling, gaming, personal shopping, personal file sharing, unapproved AI tools, or entertainment services. Never use company systems for harassment, discrimination, illegal activity, or inappropriate material.'},
  {heading:'3. Downloads, security and bandwidth',text:'Do not install unapproved software, browser extensions, VPNs, proxies, anonymizers or alternate DNS tools; bypass filters; disable security tools; upload confidential records to unauthorized services; or download or stream unnecessarily large files. Do not use company bandwidth for nonbusiness high-volume transfers. Report suspicious links, malware, lost devices or account compromises promptly.'},
  {heading:'4. Role-based access and exceptions',text:'Internet permissions are determined by the roles assigned in HR/Manage Company Employees. Admin users receive Administrator Access. Other roles remain subject to company-wide restrictions, including social media, streaming, YouTube, and adult content. Access requests require documented business justification and approval; some mandatory restrictions are non-overridable for non-admin accounts.'},
  {heading:'5. Monitoring, records and privacy',text:'Use of company-managed systems may be logged and reviewed for legitimate business, compliance, and security purposes, including permitted or blocked browsing attempts and acknowledgments. Access to activity records is restricted to authorized personnel, and records will be retained under applicable company retention practices. Personal browsing on unmanaged devices is not claimed to be monitored by Pathfinder.'},
  {heading:'6. Compliance and disciplinary action',text:'Violations may result in loss of system privileges, corrective action, formal discipline, suspension, or termination as appropriate under company procedures and applicable law. Serious misconduct may be referred to appropriate authorities. Access may be suspended during an investigation. Supervisors and the help desk may clarify approved activities.'},
  {heading:'7. Employee acknowledgment',text:'By accepting, I confirm that I have read and understand this policy, understand my company computer and internet privileges are limited to authorized use, understand that violations may result in disciplinary action, and agree to comply with future communicated policy updates.'}
];
export function AcceptableUsePolicyText(){return <div className="space-y-4">{sections.map(section=><section key={section.heading}><h3 className="font-bold text-slate-100">{section.heading}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{section.text}</p></section>)}</div>;}

export default function AcceptableUseGate({user,children}) {
  const client = useQueryClient();
  const [confirmed,setConfirmed] = useState(false);
  const [signature,setSignature] = useState('');
  const key=['acceptableUsePolicy',user?.id];
  const {data, isLoading,isError,refetch} = useQuery({
    queryKey:key,enabled:Boolean(user?.id),queryFn:async()=> (await base44.functions.invoke('acceptableUsePolicy',{action:'status'})).data,
    staleTime:5*60*1000,retry:1,refetchOnWindowFocus:false
  });
  const accept=useMutation({
    mutationFn:async()=> (await base44.functions.invoke('acceptableUsePolicy',{action:'accept',policy_version:data?.policy_version,confirmed,signature})).data,
    onSuccess:result=>{if(result?.accepted)client.setQueryData(key,prev=>({...prev,accepted:true,accepted_at:result.accepted_at}));}
  });
  if(!user?.id) return children;
  if(data?.accepted) return children;
  return <div className="fixed inset-0 z-[999999] flex items-center justify-center overflow-y-auto bg-[#030914] p-3 text-white sm:p-5" role="dialog" aria-modal="true" aria-label="Required company acceptable use acknowledgment">
    <div className="my-auto flex w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-[#315574] bg-[#091522] shadow-[0_30px_100px_rgba(0,0,0,.8)]">
      <header className="flex gap-4 border-b border-[#29435d] bg-[#10263d] p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-200"><ShieldCheck className="h-7 w-7"/></div><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Pathfinder · Required account acknowledgment</div><h1 className="mt-1 text-xl font-bold">Corporate Computer & Internet Acceptable Use Policy</h1><p className="mt-1 text-xs text-slate-300">Read and approve before continuing into your company account.</p></div></header>
      {isLoading?<div className="flex justify-center gap-2 p-12 text-slate-300"><Loader2 className="animate-spin"/>Checking policy acknowledgment…</div>
      :isError?<div className="space-y-3 p-6 text-center"><AlertTriangle className="mx-auto h-7 w-7 text-amber-300"/><p>Policy verification is unavailable. For account security, access remains held until verification succeeds.</p><button type="button" onClick={()=>refetch()} className="rounded bg-blue-600 px-5 py-2">Retry verification</button></div>
      :<><div className="max-h-[48dvh] overflow-y-auto px-5 py-5 sm:px-7"><div className="mb-4 flex justify-between gap-2 text-xs text-slate-400"><span>Applies to all Pathfinder company accounts</span><span>Policy {data?.policy_version||AUP_VERSION}</span></div><AcceptableUsePolicyText/></div>
      <div className="space-y-3 border-t border-[#29435d] bg-[#0b1d30] p-5">
        <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-cyan-500"/><span>I have read the policy, agree to the authorized-use and monitoring terms, and understand violations may result in disciplinary action.</span></label>
        <label className="block text-xs font-bold text-slate-300">Electronic signature — type your full name<input value={signature} onChange={event=>setSignature(event.target.value)} maxLength={100} autoComplete="name" placeholder={data?.user_name||'First and last name'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white"/></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4"/>Approval is saved to your account and visible in Admin Reports</span><button type="button" disabled={!confirmed||signature.trim().length<3||accept.isPending} onClick={()=>accept.mutate()} className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-black text-white disabled:opacity-40">{accept.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<FileCheck2 className="h-4 w-4"/>}Accept & Continue</button></div>
        {accept.isError && <p className="text-xs text-red-300">{accept.error?.response?.data?.error||accept.error?.message||'Could not record acknowledgment.'}</p>}
      </div></>}
    </div>
  </div>;
}