import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations } from '@/lib/appDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Bot, Loader2, FileText, MapPin, Calendar, ExternalLink, User, Radio, Car, ShieldAlert, Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { announceRecordSearch, announceVoice, setVoiceEnabled } from '@/utils/voiceAnnouncer';

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
  const [personName, setPersonName] = useState('');
  const [siteNames,setSiteNames]=useState([]);
  const [site,setSite]=useState('');
  const [residentMatches,setResidentMatches]=useState([]);
  useEffect(()=>{let mounted=true;listDirectoryLocations('site_name').then(list=>{
    if(!mounted)return;
    const options=[...new Set((list||[]).map(item=>item.site_name||item.name).filter(Boolean))];
    setSiteNames(options);
  }).catch(()=>{});return()=>{mounted=false;};},[]);
  const [courtLevel, setCourtLevel] = useState('All Court Levels');
  const [courtName, setCourtName] = useState('');
  const [caseNumber, setCaseNumber] = useState('');

  const runSearch = async (event) => {
    event?.preventDefault();
    const effectiveQuery = searchType === 'person' ? (personName.trim() || query.trim()) : query.trim();
    if (effectiveQuery.length < 2) return;
    if (searchType === 'person' && effectiveQuery !== query.trim()) setQuery(effectiveQuery);
    setSearching(true);
    try {
      const response = await base44.functions.invoke('searchCompanyRecords', { query: effectiveQuery, search_type: searchType });
      const data = response?.data || response || {};
      if (data.error) throw new Error(data.error);
      const returnedResults = data.results || [];
      setResults(returnedResults);
      setResidentMatches([]);
      if(site){
        try{
          const registryResult=await base44.functions.invoke('manageParkingRecords',{action:'records_check',site_name:site,query:effectiveQuery});
          const registry=registryResult?.data||registryResult||{};
          if(!registry.error){
            setResidentMatches(registry.matches||[]);
            if((registry.matches||[]).length)announceVoice(`Pathfinder internal records check found ${registry.matches.length} matching resident or property parking records.`,{dedupeMs:1500});
          }
        }catch(error){console.warn('Resident registry lookup unavailable:',error?.message||error)}
      }
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
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-wide">Records AI search</h1>
            <p className="text-sm text-slate-400">Search every company report for a person, vehicle, address, phone number, report number, or call number.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => { setVoiceEnabled(true); announceVoice('Records A I audio enabled.', { force: true, dedupeMs: 0 }); }} className="shrink-0 border-cyan-600/50 text-cyan-200"><Volume2 className="mr-2 h-4 w-4" />Audio on / test</Button>
        </div>

        <Card className="border-slate-700 bg-[#111d2b]">
          <CardContent className="p-4">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setSearchType('all')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'all' ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><Search className="h-3.5 w-3.5" />All records</button>
              <button type="button" onClick={() => setSearchType('person')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'person' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><User className="h-3.5 w-3.5" />People</button>
              <button type="button" onClick={() => setSearchType('vehicle')} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black ${searchType === 'vehicle' ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:text-white'}`}><Car className="h-3.5 w-3.5" />Motor vehicles</button>
            </div>
            {searchType === 'person' && (
              <div className="mb-4 grid gap-3 lg:grid-cols-[1.3fr_.7fr]">
                <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/10 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-300">Pathfinder Person Search</div>
                  <label className="mt-2 block text-[10px] font-bold uppercase text-slate-500">Name / DOB / ID / Driver License</label>
                  <Input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Example: Keys or 01/15/1990" className="mt-1 h-11 border-slate-600 bg-[#0b1522] text-white" />
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Searches Pathfinder reports, CAD history, BOLO parties, complaints, trespass records, summonses and other internal records.</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-[#0b1522] p-3">
                  <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-300">Virginia Court Verification</div>
                  <div className="mt-2 grid gap-2">
                    <select value={courtLevel} onChange={e => setCourtLevel(e.target.value)} className="h-9 w-full rounded-lg border border-slate-700 bg-[#07101a] px-2 text-xs text-white"><option>All Court Levels</option><option>General District Court</option><option>J&DR Court</option><option>Circuit Court</option></select>
                    <Input value={courtName} onChange={e => setCourtName(e.target.value)} placeholder="Court / locality (optional)" className="h-9 border-slate-700 bg-[#07101a] text-xs text-white" />
                    <Input value={caseNumber} onChange={e => setCaseNumber(e.target.value)} placeholder="Case number (optional)" className="h-9 border-slate-700 bg-[#07101a] text-xs text-white" />
                  </div>
                </div>
              </div>
            )}
            <label className="mb-3 block text-xs font-semibold text-slate-300">Property registry to include in person / vehicle check
              <select aria-label="Search resident property registry" value={site} onChange={e=>setSite(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-white sm:max-w-md"><option value="">Company records only</option>{siteNames.map(name=><option key={name} value={name}>{name}</option>)}</select>
            </label>
            <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
              {searchType !== 'person' && (
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchType === 'vehicle' ? 'Plate, VIN, year, make, model or color…' : 'Name, plate, phone, address, report or call number…'} className="h-12 border-slate-600 bg-[#0b1522] pl-10 text-white" />
                </div>
              )}
              <Button type="submit" disabled={searching || (searchType === 'person' ? personName.trim().length < 2 : query.trim().length < 2)} className={`${searchType === 'person' ? 'w-full' : ''} h-12 bg-blue-700 hover:bg-blue-600`}>
                {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{searchType === 'person' ? 'SEARCH PATHFINDER PERSON RECORDS' : searchType === 'vehicle' ? 'SEARCH VEHICLE RECORDS' : 'SEARCH COMPANY RECORDS'}
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>People search checks names, DOB/ID/license fields and structured parties. Motor Vehicle search checks plates, VINs, registration details, BOLO vehicles, parking/moving violations, summonses, incidents and fleet records.</span>
            </div>
          </CardContent>
        </Card>

        {searchType === 'person' && (
          <Card className="overflow-hidden border-cyan-900/70 bg-[#0c1724]">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-slate-800 bg-cyan-950/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-cyan-200"><ShieldAlert className="h-4 w-4" />Virginia Court Verification</div>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">Virginia OCIS requires the individual user to accept its terms before searching and prohibits automated scripting/data mining. Pathfinder therefore keeps court verification as a clearly separate official-site step instead of pretending the internal search is querying Virginia courts.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" onClick={async () => { const criteria = [personName || query, courtLevel !== 'All Court Levels' ? courtLevel : '', courtName, caseNumber ? `Case ${caseNumber}` : ''].filter(Boolean).join(' · '); await navigator.clipboard?.writeText(criteria); toast.success('Court search criteria copied'); }} className="border-slate-600 text-slate-300">Copy criteria</Button>
                  <Button type="button" onClick={() => window.open('https://eapps.courts.state.va.us/ocis/', '_blank', 'noopener,noreferrer')} className="bg-cyan-700 text-white hover:bg-cyan-600">Open official OCIS <ExternalLink className="ml-2 h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="grid gap-2 p-4 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="block text-[9px] font-black uppercase text-slate-600">Person</span><span className="text-slate-200">{personName || query || 'Not entered'}</span></div>
                <div><span className="block text-[9px] font-black uppercase text-slate-600">Court Level</span><span className="text-slate-200">{courtLevel}</span></div>
                <div><span className="block text-[9px] font-black uppercase text-slate-600">Court / Locality</span><span className="text-slate-200">{courtName || 'Any / not specified'}</span></div>
                <div><span className="block text-[9px] font-black uppercase text-slate-600">Case Number</span><span className="text-slate-200">{caseNumber || 'Not specified'}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        {(results.length > 0 || totalMatches > 0 || warrantStatusText) && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-500/15 text-blue-300">{totalMatches} MATCHES</Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-300">{searchedSources} SOURCES SEARCHED</Badge>
            {searchType === 'person' && warrantStatusText && <Badge variant="outline" className={warrantMatches > 0 ? 'border-red-600/60 text-red-300' : 'border-emerald-600/60 text-emerald-300'}><ShieldAlert className="mr-1 h-3 w-3" />{warrantStatusText.toUpperCase()}</Badge>}
            <button onClick={() => setSourceFilter('all')} className={`rounded border px-2 py-1 text-xs ${sourceFilter === 'all' ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>All</button>
            {sources.map(source => <button key={source} onClick={() => setSourceFilter(source)} className={`rounded border px-2 py-1 text-xs ${sourceFilter === source ? 'border-blue-500 bg-blue-500/15 text-blue-200' : 'border-slate-700 text-slate-400'}`}>{source}</button>)}
          </div>
        )}

        {residentMatches.length>0&&<section className="rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-3 text-sm"><h2 className="font-bold text-emerald-200">Property resident and vehicle records · {residentMatches.length}</h2><p className="mt-1 text-xs text-slate-400">Internal property registry; no government registration or DMV verification</p>{residentMatches.map((row,i)=><div key={`${row.source}-${row.id}-${i}`} className="mt-2 border-t border-emerald-900/40 pt-2"><b>{row.full_name||row.citation_number||row.vehicle_plate||row.license_plate}</b> · {row.source} · {row.unit_number?`Unit ${row.unit_number} · `:''}{row.vehicle_plate||row.license_plate||''} {row.vehicle_state||''} {row.lease_status||row.status||''}</div>)}</section>}
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