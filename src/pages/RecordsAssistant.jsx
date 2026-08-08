import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Bot, Loader2, FileText, MapPin, Calendar, ExternalLink, User, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

const SOURCE_COLORS = {
  'Incident Reports': 'border-red-500/40 text-red-300',
  'Trespassing Notices': 'border-amber-500/40 text-amber-300',
  'VA Trespass Notices': 'border-amber-500/40 text-amber-300',
  'MD Trespass Notices': 'border-amber-500/40 text-amber-300',
  'Criminal Complaints': 'border-orange-500/40 text-orange-300',
  'Use of Force Reports': 'border-purple-500/40 text-purple-300',
  'Maintenance Reports': 'border-blue-500/40 text-blue-300',
};

export default function RecordsAssistant() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchedSources, setSearchedSources] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [searching, setSearching] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');

  const runSearch = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await base44.functions.invoke('searchCompanyRecords', { query: query.trim() });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      setResults(data.results || []);
      setSearchedSources(data.searched_sources || 0);
      setTotalMatches(data.total_matches || 0);
      setSourceFilter('all');
    } catch (error) {
      toast.error(error?.message || 'Company record search failed');
    } finally {
      setSearching(false);
    }
  };

  const sources = useMemo(() => [...new Set(results.map(item => item.source))].sort(), [results]);
  const visible = sourceFilter === 'all' ? results : results.filter(item => item.source === sourceFilter);

  return (
    <div className="min-h-screen bg-[#080f19] text-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3"><Bot className="h-7 w-7 text-blue-300" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-wide">RECORDS AI SEARCH</h1>
            <p className="text-sm text-slate-400">Search every company report for a person, vehicle, address, phone number, report number, or call number.</p>
          </div>
        </div>

        <Card className="border-slate-700 bg-[#111d2b]">
          <CardContent className="p-4">
            <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Example: John Smith, ABC-1234, 804-555-0123, 123 Main Street..." className="h-12 border-slate-600 bg-[#0b1522] pl-10 text-white" />
              </div>
              <Button type="submit" disabled={searching || query.trim().length < 2} className="h-12 bg-blue-700 hover:bg-blue-600">
                {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}SEARCH ALL RECORDS
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>Searches incident, daily activity, maintenance, open-door, confidential, trespass, complaint, use-of-force, write-up, inspection, parking, summons, QR patrol, and shift reports.</span>
            </div>
          </CardContent>
        </Card>

        {(results.length > 0 || totalMatches > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-500/15 text-blue-300">{totalMatches} MATCHES</Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-300">{searchedSources} SOURCES SEARCHED</Badge>
            <button onClick={() => setSourceFilter('all')} className={`rounded border px-2 py-1 text-xs ${sourceFilter === 'all' ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>All</button>
            {sources.map(source => <button key={source} onClick={() => setSourceFilter(source)} className={`rounded border px-2 py-1 text-xs ${sourceFilter === source ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>{source}</button>)}
          </div>
        )}

        <div className="grid gap-3">
          {visible.map(item => {
            const target = `${createPageUrl('RecordViewer')}?id=${encodeURIComponent(item.id)}&entity=${encodeURIComponent(item.entity)}`;
            return (
              <Card key={`${item.entity}-${item.id}`} className="border-slate-700 bg-[#101b29] hover:border-blue-500/50">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SOURCE_COLORS[item.source] || 'border-slate-600 text-slate-300'}>{item.source}</Badge>
                        {item.status && <Badge className="bg-slate-700 text-slate-200">{String(item.status).toUpperCase()}</Badge>}
                        {item.linked_call_number && <Badge variant="outline" className="border-green-600/50 text-green-300"><Radio className="mr-1 h-3 w-3" />CALL {item.linked_call_number}</Badge>}
                      </div>
                      <h2 className="truncate text-lg font-bold text-white">{item.label || item.id}</h2>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        {item.person && <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.person}</span>}
                        {item.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}
                        {item.date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(item.date).toLocaleDateString()}</span>}
                      </div>
                      {item.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-300">{item.summary}</p>}
                    </div>
                    <Button asChild variant="outline" className="shrink-0 border-blue-600/50 text-blue-300 hover:bg-blue-500/10">
                      <Link to={target}><FileText className="mr-2 h-4 w-4" />OPEN SOURCE REPORT<ExternalLink className="ml-2 h-3 w-3" /></Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!searching && query && results.length === 0 && totalMatches === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500">No company reports matched this search.</div>
        )}
      </div>
    </div>
  );
}