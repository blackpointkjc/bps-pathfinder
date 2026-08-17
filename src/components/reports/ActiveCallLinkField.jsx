import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listActiveDispatchCalls, applyDispatchCallToForm, callDisplayNumber } from '@/lib/reportCallLinking';
import { cleanIncident } from '@/utils/callUtils';

export default function ActiveCallLinkField({ formData, setFormData, label = 'Link to Active Call for Service' }) {
  const { data: activeCalls = [], isLoading } = useQuery({
    queryKey: ['activeDispatchCallsForAllReports'],
    queryFn: () => listActiveDispatchCalls(500),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const handleChange = (callId) => {
    if (callId === 'none') {
      setFormData(prev => ({
        ...prev,
        linked_call_id: '',
        linked_call_number: '',
        linked_call_type: '',
        linked_call_location: '',
      }));
      return;
    }
    const call = activeCalls.find(item => item.id === callId);
    if (call) setFormData(prev => applyDispatchCallToForm(prev, call));
  };

  return (
    <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-950/10 p-3">
      <Label className="flex items-center gap-2"><Radio className="h-4 w-4 text-cyan-500" />{label}</Label>
      <Select value={formData?.linked_call_id || 'none'} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Loading active calls…' : 'Select active call…'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No linked call</SelectItem>
          {activeCalls.map(call => (
            <SelectItem key={call.id} value={call.id}>
              {callDisplayNumber(call)} — {cleanIncident(call)} — {call.location || 'Location pending'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {formData?.linked_call_id && (
        <div className="text-xs text-cyan-700 dark:text-cyan-300">
          Linked CAD: <strong>{formData.linked_call_number || formData.linked_call_id}</strong>
          {formData.linked_call_type ? ` · ${formData.linked_call_type}` : ''}
          {formData.linked_call_location ? ` · ${formData.linked_call_location}` : ''}
        </div>
      )}
      {!isLoading && activeCalls.length === 0 && <div className="text-xs text-slate-500">No active CAD calls are currently open.</div>}
    </div>
  );
}
