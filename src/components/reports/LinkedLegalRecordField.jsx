import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { FileText, Link2, Scale, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const officerOwns = (record, user) => String(record?.created_by_id || record?.created_by || '').toLowerCase() === String(user?.id || user?.email || '').toLowerCase();

const makeOption = (type, record) => {
  if (type === 'criminal_complaint') {
    const subject = [record.accused_first_name, record.accused_middle_name, record.accused_last_name].filter(Boolean).join(' ');
    const charge = [record.violation_code, record.violation_section].filter(Boolean).join(' — ');
    return {
      type,
      id: record.id,
      number: record.complaint_number || record.call_number || record.id,
      subject,
      charge,
      location: record.linked_call_location || record.location || '',
      callId: record.linked_call_id || '',
      callNumber: record.linked_call_number || '',
      callType: record.linked_call_type || '',
      label: `Complaint · ${record.complaint_number || 'No number'} · ${subject || 'No accused'}`,
      record,
    };
  }
  const subject = [record.defendant_name_first, record.defendant_name_middle, record.defendant_name_last].filter(Boolean).join(' ');
  const charge = [record.violation_law_section || record.violation_code, record.violation_charge_description].filter(Boolean).join(' — ');
  return {
    type,
    id: record.id,
    number: record.summons_number || record.case_number || record.id,
    subject,
    charge,
    location: record.linked_call_location || record.location_of_offense || record.offense_county_city || '',
    callId: record.linked_call_id || '',
    callNumber: record.linked_call_number || '',
    callType: record.linked_call_type || '',
    label: `Summons · ${record.summons_number || record.case_number || 'No number'} · ${subject || 'No defendant'}`,
    record,
  };
};

export default function LinkedLegalRecordField({ formData, setFormData }) {
  const [search, setSearch] = useState('');
  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentDirectoryUser });
  const { data: complaints = [], isLoading: complaintsLoading } = useQuery({
    queryKey: ['legalLinkComplaints'],
    queryFn: () => base44.entities.CriminalComplaint.list('-created_date', 500),
    enabled: !!user,
    initialData: [],
  });
  const { data: summonses = [], isLoading: summonsLoading } = useQuery({
    queryKey: ['legalLinkSummonses'],
    queryFn: () => base44.entities.Summons.list('-created_date', 500),
    enabled: !!user,
    initialData: [],
  });

  const options = useMemo(() => {
    const allowed = (records) => user?.role === 'admin' ? records : records.filter(record => officerOwns(record, user));
    const rows = [
      ...allowed(complaints).map(record => makeOption('criminal_complaint', record)),
      ...allowed(summonses).map(record => makeOption('summons', record)),
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
      linked_call_id: current.linked_call_id || row.callId,
      linked_call_number: current.linked_call_number || row.callNumber,
      linked_call_type: current.linked_call_type || row.callType,
      linked_call_location: current.linked_call_location || row.location,
      case_number: current.case_number || row.record.case_number || '',
      defendant_child_name: current.defendant_child_name || row.subject,
      charge: current.charge || row.charge,
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
        <option value="">{complaintsLoading || summonsLoading ? 'Loading legal records…' : 'Select a criminal complaint or summons'}</option>
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
      {!complaintsLoading && !summonsLoading && options.length === 0 && <div className="text-xs text-slate-500"><FileText className="mr-1 inline h-3 w-3" />No matching complaints or summonses were found.</div>}
    </div>
  );
}
