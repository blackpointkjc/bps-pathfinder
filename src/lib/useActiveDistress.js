import {useEffect,useState} from 'react';
import {base44,clearBase44ReadCacheMatching} from '@/api/base44Client';
export const distressActive=row=>['active','acknowledged','responders_enroute'].includes(row?.status);
export function distressPosition(row){
  const pair=[[row?.current_latitude,row?.current_longitude],[row?.latitude,row?.longitude]].find(([lat,lon])=>lat!=null&&lon!=null&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180&&!(Number(lat)===0&&Number(lon)===0));
  return pair?pair.map(Number):null;
}
export default function useActiveDistress(enabled=true){
 const [rows,setRows]=useState([]);
 useEffect(()=>{
  if(!enabled)return;
  let live=true,revision=0;
  const read=()=>{const started=revision;return base44.entities.OfficerDistress.list('-activated_at',50).then(data=>{if(live&&started===revision)setRows((data||[]).filter(distressActive));}).catch(()=>{});};
  const apply=row=>{if(!row?.id)return;revision++;setRows(old=>[...old.filter(a=>a.id!==row.id),...(distressActive(row)?[row]:[])]);};
  const activated=e=>{if(e.detail?.alert)apply(e.detail.alert);else{clearBase44ReadCacheMatching('entity:OfficerDistress:');void read();}};
  const cleared=e=>{revision++;setRows(old=>old.filter(a=>a.officer_id!==e.detail?.officer_id));};
  let unsub;try{unsub=base44.entities.OfficerDistress.subscribe(e=>{if(e.type==='delete')apply({...e.data,id:e.id||e.data?.id,status:'cleared'});else apply(e.data);});}catch{}
  void read();const timer=setInterval(()=>{clearBase44ReadCacheMatching('entity:OfficerDistress:');void read();},30000);
  window.addEventListener('officer-distress-activated',activated);window.addEventListener('officer-distress-cleared',cleared);
  return()=>{live=false;clearInterval(timer);unsub?.();window.removeEventListener('officer-distress-activated',activated);window.removeEventListener('officer-distress-cleared',cleared);};
 },[enabled]);return enabled?rows:[];
}
