import { createPageUrl } from '@/utils';
export function cadDestination(page,search,location=window.location) {
 const routes={CommandDashboard:['live','command'],DispatchCenter:['live','dispatch'],Navigation:['live','map'],UnitStatus:['live','units'],BOLOAlerts:['alerts','bolo'],CallHistory:['history','history']};
 const target=routes[page],current=new URLSearchParams(location.search||'');
 if(target){
  const inAdmin=/\/AdminCenter\/?$/i.test(location.pathname||'');
  const embedded=inAdmin||current.has('cad_tool')||current.has('cad_section');
  const incoming=inAdmin?new URLSearchParams(current):new URLSearchParams();
  ['new','open','call_id','call_number','callId','lat','lng'].forEach(key=>incoming.delete(key));
  for(const [key,value] of new URLSearchParams(search||''))incoming.set(key,value);
  if(inAdmin)incoming.set('admin_center','cad');
  incoming.set(embedded?'cad_section':'section',target[0]);incoming.set(embedded?'cad_tool':'tool',target[1]);
  return (inAdmin?location.pathname:createPageUrl('CADCenter'))+'?'+incoming.toString();
 }
 const incoming=new URLSearchParams(search||'');
 return createPageUrl(page)+(incoming.size?'?'+incoming.toString():'');
}
