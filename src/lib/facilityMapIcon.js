import L from 'leaflet';
const cache=new Map();
const symbols={
 fire:'<path d="M12 3s1 4-2 6c-1-2-3-3-3-3s-3 4-3 8a8 8 0 0 0 16 0c0-5-5-8-5-8s1 4-1 5c0-5-2-8-2-8Z"/>',
 police:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m12 8 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4L12 8Z"/>',
 rescue:'<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4Z"/>',
 jail:'<path d="M4 21V7l8-4 8 4v14M2 21h20M8 9v8m4-8v8m4-8v8"/>',
};
export function facilityMapIcon(kind='fire'){
 if(cache.has(kind))return cache.get(kind);
 const color={fire:'#b45309',police:'#315c8a',rescue:'#12746d',jail:'#5c6476'}[kind]||'#315c8a';
 const icon=new L.DivIcon({
  className:'pf-facility-marker',
  html:'<span style="--facility-color:'+color+'"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(symbols[kind]||symbols.fire)+'</svg></span>',
  iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-12],tooltipAnchor:[0,-12],
 });
 cache.set(kind,icon);return icon;
}
export function facilityClusterIcon(cluster){
 return new L.DivIcon({className:'pf-facility-cluster',html:'<span>'+cluster.getChildCount()+'</span>',iconSize:[28,28],iconAnchor:[14,14]});
}
