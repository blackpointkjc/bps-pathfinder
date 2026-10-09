import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const fields = [
 ['mobile_phone','Mobile phone','tel'],['address','Street address','text'],['city','City','text'],['state','State','text'],['zip','ZIP code','text'],
 ['emergency_contact_name','Emergency contact full name','text'],['emergency_contact_relationship','Emergency contact relationship','text'],['emergency_contact_phone','Emergency contact phone','tel'],
 ['drivers_license_number','Driver license number','text'],['drivers_license_state','Driver license state','text'],['drivers_license_expiration','Driver license expiration','date'],
 ['dcjs_number','DCJS registration number (if applicable)','text'],['dcjs_expiration','DCJS expiration (if applicable)','date']
];
const required = new Set(fields.filter(([name]) => !['dcjs_number','dcjs_expiration'].includes(name)).map(([name]) => name));
export default function PendingUserOnboarding({ user }) {
 const isStudent = String(user?.rank || '').toLowerCase() === 'student registration pending';
 const visibleFields = isStudent ? fields.filter(([name]) => ['mobile_phone','address','city','state','zip','dcjs_number'].includes(name)) : fields;
 const requiredFields = isStudent ? new Set(visibleFields.map(([name]) => name)) : required;
 const completed = requiredFields.size && [...requiredFields].every(name => String(user?.[name] || '').trim());
 const [values,setValues] = useState(() => Object.fromEntries(fields.map(([name]) => [name,String(user?.[name] || '')])));
 const [submitted,setSubmitted] = useState(completed);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const submit = async event => {
   event.preventDefault(); setBusy(true); setError('');
   try {
     const result = await base44.functions.invoke('completePendingProfile', values);
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
   {submitted ? <div className="mt-5 space-y-4 text-slate-200">
     <p>Your onboarding information has been submitted. Your account will remain pending until the responsible reviewer verifies your profile and assigns portal access. You cannot use the operational dashboard yet.</p>
     <p className="text-sm text-slate-400">You may safely close this page and sign back in later after your administrator approves the account.</p>
   </div> : <>
    <p className="mt-3 text-sm text-slate-300">{isStudent ? 'Enter the contact and DCJS information requested for your student record. Your trainer will review your enrollment before course access.' : 'Complete the personal and licensing details below. Payroll, tax, salary, badge, rank, SSN, date of birth, division, work assignments, and access permissions are administered separately by authorized staff.'}</p>
    <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
     {visibleFields.map(([name,label,type]) => <label key={name} className="block text-sm font-semibold text-slate-200">{label}{requiredFields.has(name) ? ' *' : ''}
       <input required={requiredFields.has(name)} type={type} autoComplete="off" value={values[name] || ''} onChange={e => setValues(prev => ({...prev,[name]:e.target.value}))} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white" />
     </label>)}
     {error && <p role="alert" className="sm:col-span-2 text-sm text-red-300">{error}</p>}
     <button disabled={busy} type="submit" className="rounded-lg bg-amber-500 px-5 py-3 font-bold text-black disabled:opacity-50 sm:col-span-2">{busy ? 'Saving…' : 'Submit for administrator review'}</button>
    </form>
   </>}
  </section>
 </main>;
}