import { createPageUrl } from '@/utils';
export function cadDestination(page,search,location=window.location) {
 const routes={CommandDashboard:['live','command'],DispatchCenter:['live','dispatch'],Navigation:['live','map'],UnitStatus:['live','units'],BOLOAlerts:['alerts','bolo'],CallHistory:['history','history']};
 const target=routes[page];
 const incoming=new URLSearchParams(search||'');
 const current=new URLSearchParams(location.search||'');
 if(target){const embedded=current.has('cad_tool')||current.has('cad_section');incoming.set(embedded?'cad_section':'section',target[0]);incoming.set(embedded?'cad_tool':'tool',target[1]);return createPageUrl('CADCenter')+'?'+incoming.toString();}
 return createPageUrl(page)+(incoming.size?'?'+incoming.toString():'');
}
