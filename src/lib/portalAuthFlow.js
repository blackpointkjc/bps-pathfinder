const resetPaths=new Set(['/reset-password','/resetpassword']);
export const AUTH_ENTRY_PATHS=['/login','/register','/signup','/forgot-password','/reset-password','/resetpassword'];
export function authEntry(location){
 const path=String(location.pathname||'').toLowerCase().replace(/\/$/,'')||'/',params=new URLSearchParams(location.search||'');
 let token=params.get('reset_token')||((resetPaths.has(path)||params.get('mode')==='reset')?params.get('token'):'')||'';
 const from=params.get('from_url');
 if(!token&&from){try{const nested=new URL(from,location.origin||'https://bpspf.blackpointkjc.com');if(resetPaths.has(nested.pathname.toLowerCase()))token=nested.searchParams.get('reset_token')||nested.searchParams.get('token')||'';}catch{}}
 const mode=token||resetPaths.has(path)?'reset':['/register','/signup'].includes(path)||params.get('mode')==='register'?'register':path==='/forgot-password'||params.get('mode')==='forgot'?'forgot':'login';
 return {isEntry:AUTH_ENTRY_PATHS.includes(path)||!!token,mode,resetToken:token,email:params.get('email')||'',requestedType:['employee','student','visitor','client'].includes(params.get('type'))?params.get('type'):'employee'};
}
export function assertAuthResponse(result){
 const value=result?.data??result;
 if(value?.error||value?.success===false)throw new Error(typeof value.error==='string'?value.error:value.message||'The account service did not accept the request.');
 return value;
}
export async function requestPasswordReset(auth,email){
 return assertAuthResponse(await auth.resetPasswordRequest(String(email||'').trim().toLowerCase()));
}
export async function completePasswordReset(auth,token,password,confirmation){
 if(!token)throw new Error('This reset link is missing its token. Request a new reset email.');
 if(password.length<12)throw new Error('Use a password with at least 12 characters.');
 if(password!==confirmation)throw new Error('The passwords do not match.');
 return assertAuthResponse(await auth.resetPassword({resetToken:token,newPassword:password}));
}
