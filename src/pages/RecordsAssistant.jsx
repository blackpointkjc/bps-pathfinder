import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Bot, Loader2, FileText, MapPin, Calendar, ExternalLink, User, Radio, Car, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { announceRecordSearch } from '@/utils/voiceAnnouncer';

const SOURCE_COLORS = {
  'CAD / Dispatch Calls': 'border-cyan-500/40 text-cyan-300',
  'Archived Call History': 'border-slate-500/40 text-slate-300',
  'Calls for Service': 'border-blue-500/40 text-blue-300',
  'BOLO / Alerts': 'border-red-500/40 text-red-300',
  'Parking Violations': 'border-yellow-500/40 text-yellow-300',
  'Moving Violations': 'border-orange-500/40 text-orange-300',
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
  const [searchType, setSearchType] = useState('all');
  const [warrantMatches, setWarrantMatches] = useState(0);
  const [warrantStatusText, setWarrantStatusText] = useState('');

  const runSearch = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await base44.functions.invoke('searchCompanyRecords', { query: query.trim(), search_type: searchType });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      const returnedResults = data.results || [];
      setResults(returnedResults);
      setSearchedSources(data.searched_sources || 0);
      setTotalMatches(data.total_matches || 0);
      setWarrantMatches(data.warrant_matches || 0);
      setWarrantStatusText(data.warrant_status_text || '');
      // Person searches also announce the Pathfinder warrant-record check. This is
      // explicitly company-records data, not an external NCIC/state warrant query.
      announceRecordSearch(returnedResults, {
        searchType,
        warrantMatches: data.warrant_matches || 0,
        warrantStatusText: data.warrant_status_text || '',
      });
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
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setSearchType('all')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'all' ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><Search className="h-3.5 w-3.5" />ALL RECORDS</button>
              <button type="button" onClick={() => setSearchType('person')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'person' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><User className="h-3.5 w-3.5" />PEOPLE</button>
              <button type="button" onClick={() => setSearchType('vehicle')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'vehicle' ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><Car className="h-3.5 w-3.5" />MOTOR VEHICLES</button>
            </div>
            <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchType === 'person' ? 'Name, DOB, ID or driver license…' : searchType === 'vehicle' ? 'Plate, VIN, year, make, model or color…' : 'Name, plate, phone, address, report or call number…'} className="h-12 border-slate-600 bg-[#0b1522] pl-10 text-white" />
              </div>
              <Button type="submit" disabled={searching || query.trim().length < 2} className="h-12 bg-blue-700 hover:bg-blue-600">
                {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}SEARCH ALL RECORDS
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>People search checks names, DOB/ID/license fields and structured parties. Motor Vehicle search checks plates, VINs, registration details, BOLO vehicles, parking/moving violations, summonses, incidents and fleet records.</span>
            </div>
          </CardContent>
        </Card>

        {(results.length > 0 || totalMatches > 0 || warrantStatusText) && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-500/15 text-blue-300">{totalMatches} MATCHES</Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-300">{searchedSources} SOURCES SEARCHED</Badge>
            {searchType === 'person' && warrantStatusText && <Badge variant="outline" className={warrantMatches > 0 ? 'border-red-600/60 text-red-300' : 'border-emerald-600/60 text-emerald-300'}><ShieldAlert className="mr-1 h-3 w-3" />{warrantStatusText.toUpperCase()}</Badge>}
            <button onClick={() => setSourceFilter('all')} className={`rounded border px-2 py-1 text-xs ${sourceFilter === 'all' ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>All</button>
            {sources.map(source => <button key={source} onClick={() => setSourceFilter(source)} className={`rounded border px-2 py-1 text-xs ${sourceFilter === source ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>{source}</button>)}
          </div>
        )}

        <div className="grid gap-3">
          {visible.map(item => {
            const isBolo = item.entity === 'BOLOAlert' || item.source === 'BOLO / Alerts';
            const target = isBolo
              ? `${createPageUrl('CADCenter')}?section=alerts&tool=bolo&open=${encodeURIComponent(item.id)}`
              : `${createPageUrl('RecordViewer')}?id=${encodeURIComponent(item.id)}&entity=${encodeURIComponent(item.entity)}`;
            return (
              <Card key={`${item.entity}-${item.id}`} className="border-slate-700 bg-[#101b29] hover:border-blue-500/50">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SOURCE_COLORS[item.source] || 'border-slate-600 text-slate-300'}>{item.source}</Badge>
                        {item.status && <Badge className="bg-slate-700 text-slate-200">{String(item.status).toUpperCase()}</Badge>}
                        {item.linked_call_number && <Badge variant="outline" className="border-green-600/50 text-green-300"><Radio className="mr-1 h-3 w-3" />CALL {item.linked_call_number}</Badge>}
                        {item.linked_call_type && <Badge variant="outline" className="border-cyan-600/50 text-cyan-300">CALL TYPE: {item.linked_call_type}</Badge>}
                      </div>
                      <h2 className="truncate text-lg font-bold text-white">{item.label || item.id}</h2>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        {item.person && <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.person}</span>}
                        {(item.vehicle_plate || item.vehicle_description) && <span className="flex items-center gap-1"><Car className="h-3 w-3" />{[item.vehicle_description, item.vehicle_plate ? `Plate ${item.vehicle_plate}${item.vehicle_state ? ` ${item.vehicle_state}` : ''}` : ''].filter(Boolean).join(' · ')}</span>}
                        {item.vehicle_vin && <span className="font-mono">VIN {item.vehicle_vin}</span>}
                        {item.warrant_issued && <span className="flex items-center gap-1 font-bold text-red-300"><ShieldAlert className="h-3 w-3" />WARRANT RECORD{item.warrant_number ? ` ${item.warrant_number}` : ''}</span>}
                        {item.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}
                        {item.date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(item.date).toLocaleDateString()}</span>}
                      </div>
                      {item.linked_call_location && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">Related CAD Location: {item.linked_call_location}</p>}
                      {item.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-300">{item.summary}</p>}
                    </div>
                    <Button asChild variant="outline" className="shrink-0 border-blue-600/50 text-blue-300 hover:bg-blue-500/10">
                      <Link to={target}><FileText className="mr-2 h-4 w-4" />{isBolo ? 'OPEN BOLO' : 'OPEN SOURCE REPORT'}<ExternalLink className="ml-2 h-3 w-3" /></Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!searching && query && results.length === 0 && totalMatches === 0 && (
          <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500">
            <div className="font-bold text-slate-300">NO MATCHING {searchType === 'person' ? 'PERSON' : searchType === 'vehicle' ? 'MOTOR VEHICLE' : 'COMPANY'} RECORDS</div>
            {searchType === 'person' && <div className="mt-2 text-sm text-emerald-400">No warrant records located in Pathfinder.</div>}
          </div>
        )}
      </div>
    </div>
  );
}