export function leaveTimeLabel(request){
 if(!request?.start_at||!request?.end_at)return (request?.start_date||'')+' through '+(request?.end_date||'')+' · all day (Eastern)';
 const display=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 return display(request.start_at)+' → '+display(request.end_at);
}
