export function accessLabel(role){
 const labels={admin:'Admin',cad_access:'CAD Access',full_access:'Full Access',hr:'HR',support_staff:'Support Staff',fleet_manager:'Fleet Manager'};
 return labels[role]||String(role||'').replaceAll('_',' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase());
}
