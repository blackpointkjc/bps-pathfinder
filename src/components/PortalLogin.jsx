import {publicBase44} from '@/api/publicClient';
import {authEntry,assertAuthResponse,requestPasswordReset,completePasswordReset} from '@/lib/portalAuthFlow';
import {recordLoginActivity} from '@/lib/sessionPolicy';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {base44,clearBase44ReadCache} from '@/api/base44Client';
import {appParams} from '@/lib/app-params';
import './portal.css';

export default function PortalLogin(){
 const params=new URLSearchParams(window.location.search),entry=authEntry(window.location);
 const [mode,setMode]=useState(()=>{try{return entry.mode==='login'&&sessionStorage.getItem('bps:verification-email')?'verify':entry.mode;}catch{return entry.mode;}});
 const [form,setForm]=useState(()=>{let saved={};try{saved=JSON.parse(sessionStorage.getItem('bps:registration-draft')||'{}');}catch{}return {email:entry.email||saved.email||'',password:'',confirm_password:'',first_name:saved.first_name||'',last_name:saved.last_name||'',date_of_birth:saved.date_of_birth||'',requested_type:params.has('type')?entry.requestedType:saved.requested_type||'employee',otp:''};});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const change=(key,value)=>setForm(p=>({...p,[key]:value}));
 const switchMode=m=>{if(m==='login')sessionStorage.removeItem('bps:verification-email');setMode(m);setError('');setMessage('');};
 async function enter(){
  const login=await publicBase44.functions.invoke('portalSession',{action:'sign_in',email:form.email.trim().toLowerCase(),password:form.password});
  const response=login.data;
  if(!response?.access_token)throw new Error(response?.error||'Sign-in could not be confirmed.');
  if(response.access_token){base44.auth.setToken(response.access_token);appParams.token=response.access_token;}
  clearBase44ReadCache();
  // Once the identity provider accepted credentials, optional onboarding sync
  // must never turn a valid login into an incorrect-password error.
  let profileId=response.user?.id;
  try {
    const r=await base44.functions.invoke('portalRegistration',{action:'profile',first_name:form.first_name,last_name:form.last_name,requested_type:form.requested_type,date_of_birth:form.date_of_birth});
    if(!r.data?.error)profileId=r.data?.profile?.id||profileId;
    else console.warn('Post-login profile sync pending:',r.data.error);
  } catch(syncError) { console.warn('Post-login profile sync deferred:',syncError?.message); }
  recordLoginActivity(profileId);
  sessionStorage.removeItem('bps:registration-draft');
  sessionStorage.setItem('bps:portal-welcome','1');
  window.location.assign('/');
 }
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(mode==='login'){await enter();}
   else if(mode==='register'){
    sessionStorage.setItem('bps:registration-draft',JSON.stringify({email:form.email.trim().toLowerCase(),first_name:form.first_name,last_name:form.last_name,requested_type:form.requested_type,date_of_birth:form.date_of_birth}));
    if(form.password!==form.confirm_password)throw new Error('The passwords do not match.');
    assertAuthResponse(await base44.auth.register({email:form.email.trim().toLowerCase(),password:form.password}));
    sessionStorage.setItem('bps:verification-email',form.email.trim().toLowerCase());setMode('verify');setMessage('Check your email for the verification code. Your account will remain pending until approved.');
   }else if(mode==='verify'){
    assertAuthResponse(await base44.auth.verifyOtp({email:form.email.trim().toLowerCase(),otpCode:form.otp.trim()}));sessionStorage.removeItem('bps:verification-email');if(form.password){await enter();}else{setMode('login');setMessage('Email verified. Sign in with your password to finish your account request.');}
   }else if(mode==='forgot'){
    await requestPasswordReset(base44.auth,form.email);setMessage('Reset request accepted. If this email has an account, check its inbox and spam folder for the password-reset link.');
   }else if(mode==='reset'){
    await completePasswordReset(base44.auth,entry.resetToken,form.password,form.confirm_password);clearBase44ReadCache();window.history.replaceState({},'', '/Login');change('password','');change('confirm_password','');setMode('login');setMessage('Password updated. Sign in with your new password.');
   }
  }catch(err){
   const status=err?.status||err?.response?.status;
   setError(status===429?'Too many attempts. Wait a moment and try again.':mode==='login'?(err?.response?.data?.error||err?.data?.error||err?.message||'Unable to sign in. Please retry.'):mode==='verify'?'Verification failed. Check the code or request another.':err?.message||'Unable to complete this request.');
  }finally{setBusy(false);}
 };
 return <main className="portal-shell bp-login fixed inset-0 overflow-y-auto">
  <div className="bp-login-backdrop" aria-hidden="true"/>
  <header className="bp-login-header"><a className="bp-wordmark" href="https://home.blackpointkjc.com/" target="_blank" rel="noopener noreferrer"><img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_68f1b0512f3251072c89babf/5fb0eff7d_UntitledProject.png" alt="BlackPoint Security shield"/><div><strong>BLACK<span>POINT</span></strong><small>PATHFINDER · OPERATIONS PORTAL</small></div></a><nav aria-label="Public links"><a href="https://home.blackpointkjc.com/" target="_blank" rel="noopener noreferrer">BlackPoint home ↗</a></nav></header>
  <div className="bp-login-layout">
   <section className="bp-login-hero"><span className="bp-login-badge">VIRGINIA DCJS LICENSED · #11-30423</span><h1>Your people.<br/><span>Your mission.</span><br/>One Pathfinder.</h1><p>One secure workspace for the people behind BlackPoint. Sign in to your assigned officer, student, client, or staff portal.</p><div className="bp-login-signature"><img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_68f1b0512f3251072c89babf/5fb0eff7d_UntitledProject.png" alt=""/><div><strong>Present. Prepared. Professional.</strong><small>Black Point KJC Security Solution LLC</small></div></div></section>
   <section className="portal-card bp-login-card"><p className="portal-eyebrow">Secure account access</p><h2>{({login:'Welcome back',register:'Request an account',verify:'Verify your email',forgot:'Reset your password',reset:'Choose a new password'})[mode]}</h2>
    {error&&<div role="alert" className="portal-message portal-error">{error}</div>}
    {message&&<div role="status" className="portal-message">{message}</div>}
    <form onSubmit={submit}>
     {mode==='register'&&<><div className="portal-grid"><label>First name<input required autoComplete="given-name" value={form.first_name} onChange={e=>change('first_name',e.target.value)}/></label><label>Last name<input required autoComplete="family-name" value={form.last_name} onChange={e=>change('last_name',e.target.value)}/></label></div><label>Account requested<select value={form.requested_type} onChange={e=>change('requested_type',e.target.value)}>{['employee','student','visitor','client'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></label>{form.requested_type==='student'&&<label>Date of birth<input required type="date" autoComplete="bday" value={form.date_of_birth} onChange={e=>change('date_of_birth',e.target.value)}/></label>}<small>Submitting a request does not grant access. Administration or Training must approve your account.</small></>}
     {mode!=='reset'&&<label className="mt-4">Email address<input required type="email" autoComplete="username" value={form.email} onChange={e=>change('email',e.target.value)}/></label>}
     {['login','register','reset'].includes(mode)&&<label>Password<input required type="password" minLength={mode==='login'?1:12} autoComplete={mode==='login'?'current-password':'new-password'} value={form.password} onChange={e=>change('password',e.target.value)}/>{mode!=='login'&&<small>Use at least 12 characters, including upper and lowercase letters, numbers and a symbol.</small>}</label>}
     {['register','reset'].includes(mode)&&<label>Confirm password<input required type="password" autoComplete="new-password" value={form.confirm_password} onChange={e=>change('confirm_password',e.target.value)}/></label>}
     {mode==='reset'&&!entry.resetToken&&<p role="alert" className="portal-message portal-error">This link is incomplete. Request a new password-reset email.</p>}
     {mode==='verify'&&<label>Email verification code<input required inputMode="numeric" autoComplete="one-time-code" value={form.otp} onChange={e=>change('otp',e.target.value)}/></label>}
     <button disabled={busy||mode==='reset'&&!entry.resetToken} type="submit" className="w-full mt-2">{busy?'Please wait…':({login:'Sign in',register:'Create account & send verification',verify:'Verify & continue',forgot:'Send reset instructions',reset:'Save new password'})[mode]}</button>
    </form>
    <div className="portal-actions">{mode!=='login'&&<button className="portal-secondary" onClick={()=>switchMode('login')}>Back to sign in</button>}{mode==='login'&&<><button className="portal-secondary" onClick={()=>switchMode('register')}>Create account</button><button className="portal-secondary" onClick={()=>switchMode('forgot')}>Forgot password?</button><button className="portal-secondary" onClick={()=>switchMode('verify')}>Verify email</button></>}{(mode==='forgot'||mode==='reset')&&<button className="portal-secondary" disabled={busy} onClick={()=>switchMode('forgot')}>Request another reset link</button>}{mode==='verify'&&<button disabled={busy} className="portal-secondary" onClick={async()=>{setBusy(true);try{assertAuthResponse(await base44.auth.resendOtp(form.email));setMessage('A new code has been sent.');}catch{setError('Could not resend the code. Please wait and retry.');}finally{setBusy(false);}}}>Resend code</button>}</div>
   </section>
  </div>
  <footer className="bp-login-footer"><span>© {new Date().getFullYear()} KJC Security Solution LLC · BlackPoint</span><a href="https://home.blackpointkjc.com/Legal" target="_blank" rel="noopener noreferrer">Privacy & legal</a><span>Account access is reviewed by authorized BlackPoint staff.</span></footer>
 </main>;
}
