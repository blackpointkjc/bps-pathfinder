import { lazy,createElement,useState } from 'react';
import Layout,{canAccessPage} from '@/Layout';
import {prepareToolLoaders} from './workspacePreparation';
import {queryClientInstance} from './query-client';
import generatedConfig from '../pages.config.js?raw';

// Read generated route metadata as text, preserving aliases without eager page imports.
const pageModules = import.meta.glob('../pages/*.jsx');
// Explicit load paths for security-sensitive browser routes. These pages must
// remain available even when the builder regenerates pages.config.js.
const browserRouteLoaders = {
  ProfessionalStandards: () => import('../pages/ProfessionalStandards.jsx'),
  VisitorPortal: () => import('../pages/VisitorPortal.jsx'),
  AdminBrowserControl: () => import('../pages/AdminBrowserControl.jsx'),
  CorporateBrowser: () => import('../pages/CorporateBrowser.jsx'),
};
const imports = Object.fromEntries([...generatedConfig.matchAll(/^import\s+(\w+)\s+from\s+['"]\.\/pages\/([^'"]+)['"]/gm)]
  .map(([, name, path]) => [name, path.endsWith('.jsx') ? path : path + '.jsx']));
const registry = generatedConfig.match(/^export const PAGES\s*=\s*\{([\s\S]*?)\n\}/m)?.[1] || '';
const entries = [...registry.matchAll(/["']([^"']+)["']\s*:\s*(\w+)/g)].map(([, name, component]) => [name, imports[component]]);
const routes = new Map([...entries, ['ProfessionalStandards','ProfessionalStandards.jsx'], ['VisitorPortal','VisitorPortal.jsx'], ['ParkingRecords', 'ParkingRecords.jsx'], ['ClientParkingRecords', 'ClientParkingRecords.jsx'], ['UnitStatus', 'UnitStatus.jsx'], ['AdminAbsenceCoverage', 'AdminAbsenceCoverage.jsx'], ['AdminBrowserControl', 'AdminBrowserControl.jsx'], ['CorporateBrowser', 'CorporateBrowser.jsx']]);
const loadedModules=new Map(),modulePromises=new Map(),routeLoaders=new Map();
// A module request can fail while the preview server is rebuilding or restarting.
// Wait for it to come back, re-request the module, and only then reload the shell.
const MODULE_FETCH_ERROR=/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module/i;
const RECOVERY_KEY='bps:module-recovery';
const RETRY_DELAYS=[600,1500,3000];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isModuleFetchError=error=>MODULE_FETCH_ERROR.test(String(error?.message||error||''));
function recoverModuleGraph(){
 try{
  const state=JSON.parse(sessionStorage.getItem(RECOVERY_KEY)||'{}');
  if((state.count||0)>=4||Date.now()-(state.at||0)<15000)return false;
  sessionStorage.setItem(RECOVERY_KEY,JSON.stringify({count:(state.count||0)+1,at:Date.now()}));
 }catch{return false;}
 window.location.reload();
 return true;
}
async function importWithRecovery(source,file){
 let lastError;
 const attempts=RETRY_DELAYS.length+1;
 for(let index=0;index<attempts;index+=1){
  if(index>0)await sleep(RETRY_DELAYS[index-1]);
  try{
   return await source();
  }catch(error){
   lastError=error;
   if(!isModuleFetchError(error))throw error;
   // Development server restarted under an open preview: ask for the module with
   // a fresh cache key so the browser cannot reuse the failed module graph.
   if(import.meta.env.DEV){
    try{
     return await import(/* @vite-ignore */ `/src/pages/${file}?t=${Date.now()}`);
    }catch(bustError){
     lastError=bustError;
    }
   }
  }
 }
 if(recoverModuleGraph())return new Promise(()=>{});
 throw lastError;
}
const Pages = Object.fromEntries([...routes].map(([name,file])=>{
 const source=browserRouteLoaders[name]||pageModules['../pages/'+file];
 if(!source)throw new Error('Missing route module: '+name);
 const load=()=>{
  if(!modulePromises.has(file))modulePromises.set(file,importWithRecovery(source,file).then(value=>{loadedModules.set(file,value);return value;}).catch(error=>{modulePromises.delete(file);throw error;}));
  return modulePromises.get(file);
 };
 routeLoaders.set(name,load);
 const LazyPage=lazy(load);
 function PreparedPage(props){
  // A tool opened after startup renders its preloaded module synchronously.
  // Keep an already-mounted initial page stable while its data warms behind Welcome.
  const [Resolved]=useState(()=>loadedModules.get(file)?.default||null);
  return createElement(Resolved||LazyPage,props);
 }
 return [name,PreparedPage];
}));
const mainPage = generatedConfig.match(/^export const pagesConfig\s*=\s*\{\s*mainPage:\s*["']([^"']+)["']/m)?.[1] || 'Home';
export const pagesConfig = { Pages, mainPage, Layout };

// Load the same page modules used by React.lazy before the welcome screen closes.
// No page is mounted here; imports cannot submit a form or run component effects.
// Each page module pulls in the components it renders, so warming the pages is
// enough and every tool still opens instantly from the cache.
const prepared=new Map();
export function prepareWorkspace(user,onProgress){
 if(prepared.has(user.id))return prepared.get(user.id);
 const approved=user.role==='admin'||user.role==='dispatch'||(user.additional_roles||[]).length||['investigator','reviewer'].includes(user.ps_role);
 const selected=approved?[...routes].filter(([name])=>canAccessPage(user,name)):[];
 const loaders=[...new Set(selected.map(([name])=>routeLoaders.get(name)))];
 const exclusive=!approved||(user.additional_roles||[]).some(r=>['visitor','student','client'].includes(r));
 const task=prepareToolLoaders(loaders,{onProgress,minimumMs:700,concurrency:10,warmData:async()=>{
  // Warm the shared workspace data without making the operator wait for it.
  // Every screen already renders its own loading state, so these requests can
  // finish behind the open workspace instead of holding the welcome screen.
  queryClientInstance.setQueryData(['currentUser'],user);
  if(!exclusive&&(user.role==='admin'||(user.additional_roles||[]).length)){
   import('./appDirectory').then(({getAppDirectory})=>getAppDirectory()).catch(()=>{});
  }
  const photo=user.profile_photo_url || user.profile_photo_original_url;
  if(photo){const image=new Image();image.src=photo;}
 }}).catch(error=>{prepared.delete(user.id);throw error;});
 prepared.set(user.id,task);return task;
}

export const getPreparedTool = file => loadedModules.get(file)?.default;