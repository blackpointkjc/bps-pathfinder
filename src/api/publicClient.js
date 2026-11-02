import {createClient} from '@base44/sdk';
import {appParams} from '@/lib/app-params';
// Public forms and sign-in must never inherit an expired staff bearer token.
export const publicBase44=createClient({appId:appParams.appId,serverUrl:typeof window==='undefined'?appParams.serverUrl:window.location.origin,requiresAuth:false});
