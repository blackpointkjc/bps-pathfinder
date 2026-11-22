import OfficerRecordReport from '@/components/records/OfficerRecordReport';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';

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
  return <div className="min-h-screen bg-[#080f19] p-4 text-slate-100 md:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3"><FileText className="h-6 w-6 text-blue-300" /></div><div><p className="text-xs font-bold tracking-widest text-blue-300">SOURCE RECORD</p><h1 className="text-2xl font-black">{data.source}</h1></div></div>
        <Button asChild variant="outline"><Link to={createPageUrl('RecordsAssistant')}><ArrowLeft className="mr-2 h-4 w-4" />Back to Search</Link></Button>
      </div>
      <OfficerRecordReport record={record} source={data.source}/>
    </div>
  </div>;
}