import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { isActiveDispatchCall, callDisplayNumber } from '@/lib/reportCallLinking';
import { cleanIncident } from '@/utils/callUtils';

export default function CallLinkCombobox({ calls = [], value, onSelect, placeholder = 'Search CAD number, incident, or location…', isLoading = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = calls.find(c => c.id === value) || null;
  const q = query.trim().toLowerCase();
  const haystack = (call) => [callDisplayNumber(call), call.incident, call.location, call.cross_street, call.landmark].filter(Boolean).join(' ').toLowerCase();
  const filtered = q ? calls.filter(c => haystack(c).includes(q)) : calls;
  const active = filtered.filter(isActiveDispatchCall);
  const history = filtered.filter(c => !isActiveDispatchCall(c));

  const handleSelect = (callId) => {
    onSelect(callId);
    setOpen(false);
    setQuery('');
  };

  const label = (call) => `${callDisplayNumber(call) || 'No CAD #'} — ${cleanIncident(call) || 'Incident pending'} — ${call.location || 'Location pending'}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              {!isActiveDispatchCall(selected) && <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">HISTORY</span>}
              <span className="truncate">{label(selected)}</span>
            </span>
          ) : (
            <span className="text-slate-500">{isLoading ? 'Loading calls…' : placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,560px)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by CAD number, incident, or location…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matching calls. Try a different CAD number.</CommandEmpty>
            {active.length > 0 && (
              <CommandGroup heading={`Active Calls (${active.length})`}>
                {active.slice(0, 200).map(call => (
                  <CommandItem key={call.id} value={call.id} onSelect={() => handleSelect(call.id)} className="gap-2">
                    <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">ACTIVE</span>
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
                      <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">HISTORY</span>
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