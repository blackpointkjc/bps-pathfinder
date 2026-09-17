import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { FileText, Link2, Scale, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const makeOption = (type, record) => {
  if (type === 'criminal_complaint') {
    const subject = [record.accused_first_name, record.accused_middle_name, record.accused_last_name].filter(Boolean).join(' ');
    const chargeCode = record.granted_charge_code || record.violation_code || '';
    const chargeDescription = record.granted_charge_description || record.violation_section || '';
    const charge = [chargeCode, chargeDescription].filter(Boolean).join(' — ');
    const caseNumber = record.magistrate_case_number || record.warrant_number || record.complaint_number || record.call_number || record.id;
    return {
      type,
      id: record.id,
      number: caseNumber,
      caseNumber,
      subject,
      charge,
      location: record.linked_call_location || record.location || '',
      callId: record.linked_call_id || '',
      callNumber: record.linked_call_number || '',
      callType: record.linked_call_type || '',
      courtDate: record.court_filing_date || '',
      courtTime: '',
      courtType: record.court_type || 'general_district',
      label: `Complaint · ${caseNumber || 'No number'} · ${subject || 'No accused'}`,
      record,
    };
  }
  const subject = [record.defendant_name_first, record.defendant_name_middle, record.defendant_name_last].filter(Boolean).join(' ');
  const charge = [record.violation_law_section || record.violation_code, record.violation_charge_description].filter(Boolean).join(' — ');
  const caseNumber = record.case_number || record.summons_number || record.id;
  return {
    type,
    id: record.id,
    number: caseNumber,
    caseNumber,
    subject,
    charge,
    location: record.linked_call_location || record.location_of_offense || record.offense_county_city || '',
    callId: record.linked_call_id || '',
    callNumber: record.linked_call_number || '',
    callType: record.linked_call_type || '',
    courtDate: record.hearing_date || '',
    courtTime: record.hearing_time || '',
    courtType: record.court_type === 'juvenile_domestic' ? 'juvenile_domestic' : 'general_district',
    label: `Summons · ${caseNumber || 'No number'} · ${subject || 'No defendant'}`,
    record,
  };
};

export default function LinkedLegalRecordField({ formData, setFormData }) {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentDirectoryUser });
  const { data: complaints = [], isPending: complaintsLoading, error: complaintsError } = useQuery({
    queryKey: ['legalLinkComplaints'],
    queryFn: () => base44.entities.CriminalComplaint.list('-created_date', 1000),
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });
  const { data: summonses = [], isPending: summonsLoading, error: summonsError } = useQuery({
    queryKey: ['legalLinkSummonses'],
    queryFn: () => base44.entities.Summons.list('-created_date', 1000),
    enabled: !!user,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!user?.id) return undefined;
    let timer = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['legalLinkComplaints'] });
        queryClient.invalidateQueries({ queryKey: ['legalLinkSummonses'] });
      }, 500);
    };
    const unsubscribers = [];
    for (const entity of ['CriminalComplaint', 'Summons']) {
      try {
        const stop = base44.entities[entity].subscribe(refresh);
        if (typeof stop === 'function') unsubscribers.push(stop);
      } catch { /* The selector still refreshes whenever it mounts. */ }
    }
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribers.forEach(stop => stop());
    };
  }, [queryClient, user?.id]);

  const options = useMemo(() => {
    // Entity read permissions are authoritative. Do not re-filter returned legal
    // records by one fragile creator field; older records legitimately use either
    // creator IDs or linked officer emails.
    const rows = [
      ...complaints.map(record => makeOption('criminal_complaint', record)),
      ...summonses.map(record => makeOption('summons', record)),
    ];
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => [row.label, row.charge, row.location, row.callNumber].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [complaints, summonses, search, user]);

  const selectedKey = formData?.linked_legal_record_id ? `${formData.linked_legal_record_type}:${formData.linked_legal_record_id}` : '';

  const selectRecord = (value) => {
    const row = options.find(option => `${option.type}:${option.id}` === value);
    if (!row) return;
    setFormData(current => ({
      ...current,
      linked_legal_record_type: row.type,
      linked_legal_record_id: row.id,
      linked_legal_record_number: row.number,
      linked_legal_record_charge: row.charge,
      linked_legal_record_subject: row.subject,
      linked_location: row.location,
      linked_call_id: row.callId || current.linked_call_id,
      linked_call_number: row.callNumber || current.linked_call_number,
      linked_call_type: row.callType || current.linked_call_type,
      linked_call_location: row.location || current.linked_call_location,
      case_number: row.caseNumber || current.case_number || '',
      defendant_child_name: row.subject || current.defendant_child_name,
      charge: row.charge || current.charge,
      court_date: row.courtDate || current.court_date,
      court_time: row.courtTime || current.court_time,
      court_type: row.courtType || current.court_type,
    }));
  };

  const clear = () => setFormData(current => ({
    ...current,
    linked_legal_record_type: '',
    linked_legal_record_id: '',
    linked_legal_record_number: '',
    linked_legal_record_charge: '',
    linked_legal_record_subject: '',
    linked_location: '',
  }));

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-950/15 p-4">
      <div>
        <div className="flex items-center gap-2 font-bold text-violet-100"><Scale className="h-4 w-4" />Link the legal case</div>
        <p className="mt-1 text-xs text-slate-400">Connect this DC-325 to the criminal complaint or summons that requires the witness. Existing case, charge, subject and CAD details are carried into the request.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search complaint or summons number, person, charge or CAD…" className="border-slate-700 bg-slate-950/50 pl-9 text-white" />
      </div>
      <select
        value={selectedKey}
        onChange={event => selectRecord(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-700 bg-[#101f2e] px-3 text-sm text-slate-100"
        aria-label="Linked criminal complaint or summons"
      >
        <option value="">{complaintsLoading || summonsLoading ? 'Loading legal records…' : `Select a criminal complaint or summons (${options.length} available)`}</option>
        {options.map(option => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}
      </select>
      {formData?.linked_legal_record_id && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-violet-500/20 bg-slate-950/40 p-3 text-xs text-slate-300">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-violet-200"><Link2 className="h-3.5 w-3.5" />{formData.linked_legal_record_number}</div>
            <div>{formData.linked_legal_record_subject || 'No subject listed'}</div>
            <div>{formData.linked_legal_record_charge || 'No charge listed'}</div>
            {formData.linked_call_number && <div className="mt-1 text-cyan-300">CAD {formData.linked_call_number}</div>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clear} className="h-7 text-slate-400 hover:text-red-300"><X className="mr-1 h-3 w-3" />Clear</Button>
        </div>
      )}
      {(complaintsError || summonsError) && (
        <div className="rounded-md border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
          Legal records could not be loaded. Please use Retry instead of creating a duplicate case.
          <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 text-red-100" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['legalLinkComplaints'] });
            queryClient.invalidateQueries({ queryKey: ['legalLinkSummonses'] });
          }}>Retry</Button>
        </div>
      )}
      {!complaintsLoading && !summonsLoading && !complaintsError && !summonsError && options.length === 0 && (
        <div className="text-xs text-slate-500"><FileText className="mr-1 inline h-3 w-3" />{search.trim() ? 'No legal records match this search.' : 'No criminal complaints or summonses are available to link.'}</div>
      )}
    </div>
  );
}
