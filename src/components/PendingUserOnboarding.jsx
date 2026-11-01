import { useState } from 'react';
import {useAuth} from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import StudentPortal from '@/pages/StudentPortal';

const fields = [
 ['date_of_birth','Date of birth','date'],['mobile_phone','Mobile phone','tel'],['address','Street address','text'],['city','City','text'],['state','State','text'],['zip','ZIP code','text'],
 ['emergency_contact_name','Emergency contact full name','text'],['emergency_contact_relationship','Emergency contact relationship','text'],['emergency_contact_phone','Emergency contact phone','tel'],
 ['drivers_license_number','Driver license number','text'],['drivers_license_state','Driver license state','text'],['drivers_license_expiration','Driver license expiration','date'],
 ['dcjs_number','DCJS registration number (if applicable)','text'],['dcjs_expiration','DCJS expiration (if applicable)','date']
];
const required = new Set(fields.filter(([name]) => !['date_of_birth','dcjs_number','dcjs_expiration'].includes(name)).map(([name]) => name));
export default function PendingUserOnboarding({ user }) {
 const {checkAppState,logout}=useAuth();
 const limitedIntake=['visitor','client'].includes(user?.requested_account_type);
 const [registration,setRegistration]=useState({first_name:user?.first_name||'',last_name:user?.last_name||'',requested_type:user?.requested_account_type||'employee'});
 const isStudent = String(user?.rank || '').toLowerCase() === 'student registration pending';
 const visibleFields = limitedIntake ? fields.filter(([name])=>name==='mobile_phone') : isStudent ? fields.filter(([name]) => ['date_of_birth','mobile_phone','address','city','state','zip','dcjs_number'].includes(name)) : fields.filter(([name])=>name!=='date_of_birth');
 const requiredFields = limitedIntake ? new Set(['mobile_phone']) : isStudent ? new Set(visibleFields.map(([name]) => name)) : required;
 const completed = requiredFields.size && [...requiredFields].every(name => String(user?.[name] || '').trim());
 const [values,setValues] = useState(() => Object.fromEntries(fields.map(([name]) => [name,String(user?.[name] || '')])));
 const [submitted,setSubmitted] = useState(completed);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const submit = async event => {
   event.preventDefault(); setBusy(true); setError('');
   try {
     const profile=await base44.functions.invoke('portalRegistration',{action:'profile',...registration,date_of_birth:values.date_of_birth||user?.date_of_birth||''});
     if(profile.data?.error)throw new Error(profile.data.error);
     const result = await base44.functions.invoke('completePendingProfile', {...values,first_name:registration.first_name,last_name:registration.last_name});
     const data = result?.data || result || {};
     if (!data.success) throw new Error(data.error || 'Unable to submit your profile');
     setSubmitted(true);
   } catch (err) { setError(err?.response?.data?.error || err?.message || 'Unable to save profile'); }
   finally { setBusy(false); }
 };
 return <main className="fixed inset-0 overflow-y-auto bg-[#060b13] p-4 text-white sm:p-8">
  <section className="mx-auto max-w-3xl rounded-2xl border border-amber-600/40 bg-[#101c2c] p-6 shadow-xl">
   <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Black Point | Secure registration</p>
   <h1 className="mt-2 text-2xl font-black">{submitted ? (isStudent ? 'Pending trainer review' : 'Pending administrator approval') : (isStudent ? 'Complete your student registration' : 'Complete your new account profile')}</h1>
   {submitted && isStudent ? <div className="mt-5"><StudentPortal onboardingOnly /></div> : submitted ? <div className="mt-5 space-y-4 text-slate-200">
     <p>Your account profile has been submitted successfully. Your account will remain pending while the Administration Department reviews your information and confirms your assigned access.</p>
     <p className="text-sm text-slate-400">You may close this page. Once your administrator approves your account, sign in again to access your employee portal.</p>
   </div> : <>
    <p className="mt-3 text-sm text-slate-300">{isStudent ? 'Enter the contact and DCJS information requested for your student record. Your trainer will review your enrollment before course access.' : 'Complete the personal and licensing details below. Payroll, tax, salary, badge, rank, SSN, date of birth, division, work assignments, and access permissions are administered separately by authorized staff.'}</p>
    <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
     {(!user?.first_name||!user?.last_name)&&<>{['first_name','last_name'].map(name=><label key={name} className="text-sm font-semibold">{name==='first_name'?'First name':'Last name'}<input required value={registration[name]} onChange={e=>setRegistration(p=>({...p,[name]:e.target.value}))} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-3 text-white"/></label>)}<label className="sm:col-span-2">Account requested<select value={registration.requested_type} onChange={e=>setRegistration(p=>({...p,requested_type:e.target.value}))} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-3 text-white">{['employee','student','client','visitor'].map(v=><option key={v}>{v}</option>)}</select></label></>}
     {visibleFields.map(([name,label,type]) => <label key={name} className="block text-sm font-semibold text-slate-200">{label}{requiredFields.has(name) ? ' *' : ''}
       <input required={requiredFields.has(name)} type={type} autoComplete="off" value={values[name] || ''} onChange={e => setValues(prev => ({...prev,[name]:e.target.value}))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white" />
     </label>)}
     {error && <p role="alert" className="sm:col-span-2 text-sm text-red-300">{error}</p>}
     <button disabled={busy} type="submit" className="rounded-lg bg-amber-500 px-5 py-3 font-bold text-black disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : (isStudent ? 'Continue student registration' : 'Submit for administrator review')}</button>
    </form>
   </>}
  <div className="mt-6 flex flex-wrap gap-3"><button onClick={checkAppState} className="rounded border border-slate-500 px-4 py-2 text-sm">Check approval status</button><button onClick={()=>logout(true)} className="rounded border border-slate-500 px-4 py-2 text-sm">Sign out</button><a href="/IAFORM" className="rounded border border-slate-500 px-4 py-2 text-sm">Public complaint services</a></div>
  </section>
 </main>;
}