import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Loader2, Radio } from 'lucide-react';
import { createPageUrl } from '@/utils';

const HIDDEN = new Set(['id','created_by_id','updated_date']);
const label = key => key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
const display = value => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

export default function RecordViewer() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const entity = params.get('entity');
  const { data, isLoading, error } = useQuery({
    queryKey: ['recordViewer', entity, id],
    queryFn: async () => {
      const response = await base44.functions.invoke('searchCompanyRecords', { action: 'get', entity, id });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!id && !!entity,
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#080f19]"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;
  if (error || !data?.record) return <div className="min-h-screen bg-[#080f19] p-8 text-slate-200"><p>{error?.message || 'Record not found.'}</p><Button asChild className="mt-4"><Link to={createPageUrl('RecordsAssistant')}>Back to Records AI</Link></Button></div>;

  const record = data.record;
  const entries = Object.entries(record).filter(([key]) => !HIDDEN.has(key));
  return <div className="min-h-screen bg-[#080f19] p-4 text-slate-100 md:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3"><FileText className="h-6 w-6 text-blue-300" /></div><div><p className="text-xs font-bold tracking-widest text-blue-300">SOURCE RECORD</p><h1 className="text-2xl font-black">{data.source}</h1></div></div>
        <Button asChild variant="outline"><Link to={createPageUrl('RecordsAssistant')}><ArrowLeft className="mr-2 h-4 w-4" />Back to Search</Link></Button>
      </div>
      <Card className="border-slate-700 bg-[#111d2b]">
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">{record.report_number || record.notice_number || record.complaint_number || record.summons_number || record.id}{record.status && <Badge className="bg-slate-700">{String(record.status).toUpperCase()}</Badge>}{(record.linked_call_number || record.call_number) && <Badge variant="outline" className="border-green-600/50 text-green-300"><Radio className="mr-1 h-3 w-3" />CALL {record.linked_call_number || record.call_number}</Badge>}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {entries.map(([key,value]) => <div key={key} className={`rounded-lg border border-slate-700 bg-[#0b1522] p-3 ${typeof value === 'string' && value.length > 140 ? 'md:col-span-2' : ''}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label(key)}</p><pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-200">{display(value)}</pre></div>)}
        </CardContent>
      </Card>
    </div>
  </div>;
}