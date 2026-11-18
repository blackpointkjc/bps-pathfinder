import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { loadLegalRecordHistory } from '@/lib/legalRecordHistory';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Gavel, Link2, Radio, Scale, Users } from 'lucide-react';
import { format } from 'date-fns';

const text = value => String(value || '').trim();
const normSite = value => text(value).split(' - ')[0].split(':')[0].trim().toLowerCase();
const ownRecord = (record, user) => {
  const creator = String(record?.created_by_id || record?.created_by || '').toLowerCase();
  return creator === String(user?.id || '').toLowerCase() || creator === String(user?.email || '').toLowerCase();
};
const when = row => row.updated_date || row.created_date || row.complaint_date || row.summons_date || '';
const dateLabel = value => {
  if (!value) return 'Date unavailable';
  try { return format(new Date(value), 'MMM d, yyyy · h:mm a'); } catch { return value; }
};

function CaseRow({ row }) {
  const isComplaint = row.kind === 'Complaint';
  const isSummons = row.kind === 'Summons';
  const outcome = row.magistrate_disposition;
  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#101b29] p-4 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isComplaint ? 'bg-red-950 text-red-200' : isSummons ? 'bg-blue-950 text-blue-200' : 'bg-violet-950 text-violet-200'}>{row.kind}</Badge>
            <strong className="text-white">{row.number || 'Unnumbered record'}</strong>
            <Badge variant="outline" className="border-slate-600 text-slate-300">{text(row.status).replaceAll('_', ' ').toUpperCase() || 'DRAFT'}</Badge>
            {outcome && <Badge className={outcome === 'granted' ? 'bg-emerald-700' : outcome === 'denied' ? 'bg-red-700' : 'bg-amber-700'}><Gavel className="mr-1 h-3 w-3" />{outcome.replaceAll('_', ' ').toUpperCase()}</Badge>}
          </div>
          <div className="mt-2 font-semibold text-slate-100">{row.subject || 'No subject entered'}</div>
          <div className="text-sm text-slate-400">{row.charge || 'No charge entered'}</div>
        </div>
        <div className="text-right text-xs text-slate-500">{dateLabel(when(row))}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 pt-3 text-xs">
        {row.linked_call_number && <span className="text-cyan-300"><Radio className="mr-1 inline h-3.5 w-3.5" />CAD {row.linked_call_number}</span>}
        {row.linked_legal_record_number && <span className="text-violet-300"><Link2 className="mr-1 inline h-3.5 w-3.5" />Linked to {row.linked_legal_record_number}</span>}
        {row.location && <span>{row.location}</span>}
      </div>
      {isComplaint && outcome && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-xs">
          <div className="font-bold text-slate-200">Magistrate result</div>
          <div className="mt-1 text-slate-400">
            {row.magistrate_name ? `Magistrate: ${row.magistrate_name} · ` : ''}
            {row.magistrate_decision_date ? dateLabel(row.magistrate_decision_date) : 'Decision date not entered'}
          </div>
          {outcome === 'granted' && <div className="mt-1 text-emerald-300">Granted charge: {[row.granted_charge_code, row.granted_charge_description].filter(Boolean).join(' — ') || 'Not entered'}</div>}
          {row.magistrate_case_number && <div className="mt-1">Court/process number: {row.magistrate_case_number}</div>}
          {row.magistrate_notes && <div className="mt-1 whitespace-pre-wrap text-slate-400">{row.magistrate_notes}</div>}
        </div>
      )}
    </div>
  );
}

export default function LegalCaseHistoryPanel({ audience = 'officer', clientLocations = [], title = 'Enforcement Case History', limit = 100 }) {
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentDirectoryUser, enabled: audience !== 'client' });
  const { data, isLoading } = useQuery({
    queryKey: ['legalCaseHistory', audience, clientLocations.join('|'), user?.id],
    queryFn: async () => {
      const [complaints, summonses, subpoenas] = await Promise.all([
        loadLegalRecordHistory('complaint'),
        loadLegalRecordHistory('summons'),
        loadLegalRecordHistory('subpoena'),
      ]);
      return { complaints, summonses, subpoenas };
    },
    enabled: audience === 'client' ? clientLocations.length > 0 : !!user,
    initialData: { complaints: [], summonses: [], subpoenas: [] },
  });

  const rows = useMemo(() => {
    const sites = new Set(clientLocations.map(normSite).filter(Boolean));
    const canSee = record => {
      if (audience === 'admin') return true;
      if (audience === 'officer') return true;
      const possibleSites = [record.location, record.linked_location, record.linked_call_location, record.location_of_offense, record.offense_county_city, record.court_location].map(normSite);
      return possibleSites.some(site => site && sites.has(site));
    };
    const mapped = [
      ...data.complaints.filter(canSee).map(row => ({
        ...row, kind: 'Complaint', number: row.complaint_number, subject: [row.accused_first_name, row.accused_middle_name, row.accused_last_name].filter(Boolean).join(' '), charge: [row.violation_code, row.violation_section].filter(Boolean).join(' — '),
      })),
      ...data.summonses.filter(canSee).map(row => ({
        ...row, kind: 'Summons', number: row.summons_number || row.case_number, subject: [row.defendant_name_first, row.defendant_name_middle, row.defendant_name_last].filter(Boolean).join(' '), charge: [row.violation_law_section || row.violation_code, row.violation_charge_description].filter(Boolean).join(' — '), location: row.linked_call_location || row.location_of_offense || row.offense_county_city,
      })),
      ...data.subpoenas.filter(canSee).map(row => ({
        ...row, kind: 'Witness subpoena', number: row.case_number || row.id, subject: row.defendant_child_name || row.plaintiff_petitioner_name, charge: row.charge, location: row.linked_location || row.linked_call_location || row.court_location,
      })),
    ];
    return mapped.sort((a, b) => String(when(b)).localeCompare(String(when(a)))).slice(0, limit);
  }, [audience, clientLocations, data, limit, user]);

  return (
    <Card className="border-slate-700/80 bg-[#0c1725] text-slate-100 shadow-xl">
      <CardHeader className="border-b border-slate-800 bg-[#111d2b]">
        <CardTitle className="flex items-center gap-2 text-white"><Scale className="h-5 w-5 text-violet-300" />{title}</CardTitle>
        <p className="text-xs text-slate-400">Review complaints, summonses and witness subpoenas together, including their CAD link and magistrate result.</p>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? <div className="py-8 text-center text-sm text-slate-500">Loading legal history…</div> : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500"><FileText className="mx-auto mb-2 h-8 w-8" />No connected enforcement records found.</div>
        ) : <div className="space-y-3">{rows.map(row => <CaseRow key={`${row.kind}:${row.id}`} row={row} />)}</div>}
        {audience === 'client' && <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500"><Users className="h-3.5 w-3.5" />Only records matching the client’s assigned sites are shown.</div>}
      </CardContent>
    </Card>
  );
}
