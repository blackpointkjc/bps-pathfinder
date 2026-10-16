// Shared personnel policy. This module contains no runtime or service dependencies.
export const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
export const RANK_SERIES: Record<string, {start:number,end:number}> = {
 'Colonel':{start:100,end:199},'Lt Colonel':{start:200,end:299},
 'Major':{start:300,end:349},'Captain':{start:350,end:399},
 'Lieutenant':{start:400,end:449},'First Sergeant':{start:450,end:499},
 'Sergeant':{start:500,end:549},'Corporal':{start:550,end:599},
 'Senior officer':{start:600,end:649},'Officer':{start:650,end:699},
 'Unarmed Officer':{start:700,end:799}
};
export const PAY_RANGES: Record<string, {min:number,max:number}> = {
 'Unarmed Officer':{min:18,max:20},'Officer':{min:19.5,max:21.5},
 'Senior officer':{min:20.5,max:22.5},'Corporal':{min:21,max:23},
 'Sergeant':{min:22,max:24},'First Sergeant':{min:23,max:25},
 'Lieutenant':{min:24,max:26},'Captain':{min:25,max:27},
 'Major':{min:27.5,max:27.5},'Lt Colonel':{min:27.5,max:27.5},'Colonel':{min:27.5,max:27.5}
};
export function normalizeRank(value: unknown) {
 const rank=String(value || '').trim().replace(/\s*\(.*\)\s*$/,'').replace(/[.]/g,'').replace(/\s+/g,' ').toLowerCase();
 if(['lieutenant colonel','lt colonel','lt col'].includes(rank)) return 'Lt Colonel';
 if(rank==='armed officer') return 'Officer';
 return RANKS.find(item=>item.toLowerCase()===rank) || String(value || '').trim();
}
export const rankLevel = (value: unknown) => {const index=RANKS.indexOf(normalizeRank(value));return index<0?999:index;};
export function comparePersonnel(a: any,b: any) {
 const unit=(p: any)=>Number(p?.unit_number || p?.unitNumber)>0?Number(p.unit_number || p.unitNumber):999999;
 const name=(p: any)=>[p?.last_name || p?.lastName,p?.first_name || p?.firstName,p?.full_name,p?.email,p?.id].filter(Boolean).join(' ');
 return rankLevel(a?.rank)-rankLevel(b?.rank) || unit(a)-unit(b) || name(a).localeCompare(name(b));
}
export const getPayRangeForRank = (rank: unknown) => PAY_RANGES[normalizeRank(rank)] || {min:18,max:20};
export function nextUnitNumber(rank: unknown, users: any[] = [], excludedId = '') {
 const series=RANK_SERIES[normalizeRank(rank)];
 if(!series) return '';
 const used=new Set(users.filter(p=>p.id!==excludedId).map(p=>Number(p.unit_number)).filter(Number.isSafeInteger));
 for(let candidate=series.start;candidate<=series.end;candidate++) if(!used.has(candidate)) return String(candidate);
 throw new Error('No available unit numbers in the '+normalizeRank(rank)+' series');
}
export function previewRankChange(original: any, rank: unknown, users: any[] = []) {
 const normalized=normalizeRank(rank);
 if(normalized===normalizeRank(original?.rank)) return {rank:normalized,unit_number:original?.unit_number || '',hourly_rate:original?.hourly_rate ?? getPayRangeForRank(normalized).min};
 return {rank:normalized,unit_number:nextUnitNumber(normalized,users,original?.id),hourly_rate:PAY_RANGES[normalized]?.min ?? original?.hourly_rate ?? 18};
}
