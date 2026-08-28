import { useQuery } from '@tanstack/react-query';
import { Radio, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { listAllDispatchCallsForLinking, applyDispatchCallToForm } from '@/lib/reportCallLinking';
import CallLinkCombobox from '@/components/reports/CallLinkCombobox';

export default function ActiveCallLinkField({ formData, setFormData, label = 'Link to Active Call for Service' }) {
  const { data: calls = [], isLoading, error } = useQuery({
    queryKey: ['dispatchCallsForLinking'],
    queryFn: () => listAllDispatchCallsForLinking(1000),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const handleSelect = (callId) => {
    const call = calls.find(item => item.id === callId);
    if (!call) return;
    setFormData(prev => applyDispatchCallToForm(prev, call));
  };

  const clearLink = () => {
    setFormData(prev => ({
      ...prev,
      linked_call_id: '',
      linked_call_number: '',
      linked_call_type: '',
      linked_call_location: '',
    }));
  };

  return (
    <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-950/10 p-3">
      <Label className="flex items-center gap-2"><Radio className="h-4 w-4 text-cyan-500" />{label}</Label>
      <CallLinkCombobox
        calls={calls}
        value={formData?.linked_call_id || ''}
        onSelect={handleSelect}
        isLoading={isLoading}
        placeholder="Search active or cleared calls by CAD number…"
      />
      {formData?.linked_call_id && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-cyan-700 dark:text-cyan-300">
            Linked CAD: <strong>{formData.linked_call_number || formData.linked_call_id}</strong>
            {formData.linked_call_type ? ` · ${formData.linked_call_type}` : ''}
            {formData.linked_call_location ? ` · ${formData.linked_call_location}` : ''}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearLink} className="h-7 px-2 text-xs text-slate-500 hover:text-red-500">
            <X className="mr-1 h-3 w-3" />Clear
          </Button>
        </div>
      )}
      {error && <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Active call list could not load: {error.message}</div>}
      {!isLoading && !error && calls.length === 0 && <div className="text-xs text-slate-500">No dispatch calls found.</div>}
    </div>
  );
}