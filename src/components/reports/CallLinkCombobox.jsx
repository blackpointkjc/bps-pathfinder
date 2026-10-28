import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { isActiveDispatchCall, callDisplayNumber, listAllDispatchCallsForLinking } from '@/lib/reportCallLinking';
import { cleanIncident } from '@/utils/callUtils';

export default function CallLinkCombobox({ calls = [], value, onSelect, placeholder = 'Search CAD number, incident, or location…', isLoading = false, selectedLabel = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [remote,setRemote]=useState([]);
  const [picked,setPicked]=useState(null);
  const [searching,setSearching]=useState(false);
  const [searchError,setSearchError]=useState('');
  useEffect(()=>{let active=true;if(!open||!query.trim()){setRemote([]);setSearching(false);return;}
    setSearching(true);setSearchError('');
    const timer=setTimeout(()=>{listAllDispatchCallsForLinking(200,query.trim()).then(rows=>{if(active)setRemote(rows);}).catch(error=>{if(active)setSearchError(error.message||'CAD search failed');}).finally(()=>{if(active)setSearching(false);});},400);
    return()=>{active=false;clearTimeout(timer);};
  },[open,query]);
  const options=[...new Map([...calls,...remote,...(picked?[picked]:[])].map(call=>[call.id,call])).values()];
  const selected = options.find(c => c.id === value) || null;
  const q = query.trim().toLowerCase();
  const haystack = (call) => [callDisplayNumber(call), call.bps_reference, call.agency_cad_number, call.call_id, call.incident, call.location, call.cross_street, call.landmark, call.property_name].filter(Boolean).join(' ').toLowerCase();
  const filtered = q ? options.filter(c => haystack(c).includes(q)) : options;
  const active = filtered.filter(isActiveDispatchCall);
  const history = filtered.filter(c => !isActiveDispatchCall(c));

  const handleSelect = (callId) => {
    const call=options.find(row=>row.id===callId);setPicked(call);onSelect(callId,call);
    setOpen(false);
    setQuery('');
  };

  const label = (call) => `${callDisplayNumber(call) || 'No CAD #'} — ${String(cleanIncident(call)||'Incident Pending').toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase())} — ${call.property_name ? `${call.property_name} · ` : ''}${call.location || 'Location pending'}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              {!isActiveDispatchCall(selected) && <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">History</span>}
              <span className="truncate">{label(selected)}</span>
            </span>
          ) : (
            <span className="text-slate-500">{value && selectedLabel ? selectedLabel : isLoading ? 'Loading Calls…' : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,560px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by CAD number, incident, or location…" value={query} onValueChange={setQuery} />
          <CommandList>
            {searching&&<div role="status" className="px-3 py-2 text-xs">Searching Call Archive…</div>}{searchError&&<div role="alert" className="px-3 py-2 text-xs text-red-500">{searchError}</div>}<CommandEmpty>{searching?'Searching…':'No Matching Calls. Search A Full Or Partial CAD Number.'}</CommandEmpty>
            {active.length > 0 && (
              <CommandGroup heading={`Active Calls (${active.length})`}>
                {active.slice(0, 200).map(call => (
                  <CommandItem key={call.id} value={call.id} onSelect={() => handleSelect(call.id)} className="gap-2">
                    <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">Active</span>
                    {call.property_name && <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">Property</span>}
                    <span className="min-w-0 flex-1 truncate">{label(call)}</span>
                    {value === call.id && <Check className="h-4 w-4 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {history.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Call History (${history.length})`}>
                  {history.slice(0, 200).map(call => (
                    <CommandItem key={call.id} value={call.id} onSelect={() => handleSelect(call.id)} className="gap-2">
                      <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">History</span>
                      {call.property_name && <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">Property</span>}
                      <span className="min-w-0 flex-1 truncate">{label(call)}</span>
                      {value === call.id && <Check className="h-4 w-4 shrink-0" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}