import { lazy } from 'react';
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
const Pages = Object.fromEntries([...routes].map(([name, file]) => {
  const loader = browserRouteLoaders[name] || pageModules[`../pages/${file}`];
  if (!loader) throw new Error(`Missing route module: ${name}`);
  return [name, lazy(loader)];
}));
const mainPage = generatedConfig.match(/^export const pagesConfig\s*=\s*\{\s*mainPage:\s*["']([^"']+)["']/m)?.[1] || 'Home';
export const pagesConfig = { Pages, mainPage, Layout };

// Load the same modules used by React.lazy before the welcome screen closes.
// No page is mounted here; imports cannot submit a form or run component effects.
const toolComponents=import.meta.glob('../components/**/*.jsx');
const prepared=new Map();
export function prepareWorkspace(user,onProgress){
 if(prepared.has(user.id))return prepared.get(user.id);
 const selected=[...routes].filter(([name])=>canAccessPage(user,name));
 const loaders=[...new Set(selected.map(([name,file])=>browserRouteLoaders[name]||pageModules['../pages/'+file]))];
 const exclusive=(user.additional_roles||[]).some(r=>['visitor','student','client'].includes(r));
 if(!exclusive)loaders.push(...Object.values(toolComponents));
 const task=prepareToolLoaders(loaders,{onProgress,minimumMs:3000,warmData:async()=>{
  queryClientInstance.setQueryData(['currentUser'],user);
  if(!exclusive&&(user.role==='admin'||(user.additional_roles||[]).length)){
   const {getAppDirectory}=await import('./appDirectory');await getAppDirectory();
  }
  const photo=user.profile_photo_original_url||user.profile_photo_url;
  if(photo)await new Promise(resolve=>{const image=new Image();image.onload=resolve;image.onerror=resolve;image.src=photo;if(image.complete)resolve();});
 }}).catch(error=>{prepared.delete(user.id);throw error;});
 prepared.set(user.id,task);return task;
}
