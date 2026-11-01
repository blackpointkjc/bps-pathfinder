import { lazy,createElement,useState } from 'react';
import Layout,{canAccessPage} from '@/Layout';
import {prepareToolLoaders,waitForWorkspaceIdle} from './workspacePreparation';
import {getBase44RequestHealth} from '@/api/base44Client';
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
const Pages = Object.fromEntries([...routes].map(([name,file])=>{
 const source=browserRouteLoaders[name]||pageModules['../pages/'+file];
 if(!source)throw new Error('Missing route module: '+name);
 const load=()=>{
  if(!modulePromises.has(file))modulePromises.set(file,source().then(value=>{loadedModules.set(file,value);return value;}).catch(error=>{modulePromises.delete(file);throw error;}));
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

// Load the same modules used by React.lazy before the welcome screen closes.
// No page is mounted here; imports cannot submit a form or run component effects.
const toolComponents=import.meta.glob('../components/**/*.jsx');
const prepared=new Map();
export function prepareWorkspace(user,onProgress){
 if(prepared.has(user.id))return prepared.get(user.id);
 const approved=user.role==='admin'||user.role==='dispatch'||(user.additional_roles||[]).length||['investigator','reviewer'].includes(user.ps_role);
 const selected=approved?[...routes].filter(([name])=>canAccessPage(user,name)):[];
 const loaders=[...new Set(selected.map(([name])=>routeLoaders.get(name)))];
 const exclusive=!approved||(user.additional_roles||[]).some(r=>['visitor','student','client'].includes(r));
 if(!exclusive)loaders.push(...Object.values(toolComponents));
 const task=prepareToolLoaders(loaders,{onProgress,minimumMs:3000,warmData:async()=>{
  queryClientInstance.setQueryData(['currentUser'],user);
  if(!exclusive&&(user.role==='admin'||(user.additional_roles||[]).length)){
   const {getAppDirectory}=await import('./appDirectory');await getAppDirectory();
  }
  const photo=user.profile_photo_original_url||user.profile_photo_url;
  if(photo)await new Promise(resolve=>{const image=new Image();image.onload=resolve;image.onerror=resolve;image.src=photo;if(image.complete)resolve();});
  await waitForWorkspaceIdle(()=>{const health=getBase44RequestHealth();return health.activeReads===0&&health.queuedReads===0&&health.activeWrites===0&&queryClientInstance.isFetching()===0;});
 }}).catch(error=>{prepared.delete(user.id);throw error;});
 prepared.set(user.id,task);return task;
}

export const getPreparedTool = file => loadedModules.get(file)?.default;
