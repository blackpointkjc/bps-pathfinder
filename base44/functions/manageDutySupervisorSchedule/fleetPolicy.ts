// @ts-nocheck
const clean=v=>String(v||'').trim().toLowerCase();
export function interval(row){
 const day=row.assignment_date||row.shift_date;
 const start=Date.parse(day+'T'+String(row.start_time||'00:00').slice(0,5)+':00Z');
 let end=Date.parse(day+'T'+String(row.end_time||'00:00').slice(0,5)+':00Z');
 if(end<=start)end+=86400000;
 return [start,end];
}
export function intersects(a,b){const [as,ae]=interval(a),[bs,be]=interval(b);return as<be&&bs<ae;}
