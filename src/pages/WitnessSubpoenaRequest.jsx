import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';
import { loadLegalRecordHistory, updateLegalRecord } from '@/lib/legalRecordHistory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import SignaturePad from '@/components/SignaturePad';
import { FilePlus2, FolderOpen, PenTool, Plus, Printer, Save, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { printDc325 } from '@/lib/dc325Print';
import ActiveCallLinkField from '@/components/reports/ActiveCallLinkField';
import LinkedLegalRecordField from '@/components/reports/LinkedLegalRecordField';
import LegalCaseHistoryPanel from '@/components/reports/LegalCaseHistoryPanel';

const blankWitness = () => ({
  last_name: '', first_name: '', middle_name: '', street_address: '', city_state_zip: '',
  locality_type: 'city', locality_name: '', phone_area: '', phone_number: '',
});

const initialForm = () => ({
  court_location: '',
  court_type: 'general_district',
  general_case_type: 'criminal',
  case_number: '',
  jurisdiction_type: 'commonwealth',
  locality_type: 'city',
  locality_name: '',
  plaintiff_petitioner_name: '',
  case_caption_type: 'versus',
  defendant_child_name: '',
  charge: '',
  court_date: '',
  court_time: '',
  court_time_period: 'AM',
  requested_on_behalf_of: 'commonwealth',
  requested_by_name: '',
  requested_by_signature_url: '',
  requested_by_phone_area: '',
  requested_by_phone_number: '',
  date_received: '',
  date_issued: '',
  linked_call_id: '',
  linked_call_number: '',
  linked_call_type: '',
  linked_call_location: '',
  linked_legal_record_type: '',
  linked_legal_record_id: '',
  linked_legal_record_number: '',
  linked_legal_record_charge: '',
  linked_legal_record_subject: '',
  linked_location: '',
  witnesses: Array.from({ length: 4 }, blankWitness),
  status: 'draft',
});

function Choice({ checked, onChange, label, type = 'radio', name }) {
  return (
    <label className="dc-choice">
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function LineInput({ value, onChange, className = '', placeholder = '', type = 'text', ariaLabel }) {
  return (
    <input
      className={`dc-line-input ${className}`}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      aria-label={ariaLabel || placeholder}
    />
  );
}

function WitnessBox({ witness, index, onChange, onRemove, canRemove }) {
  const set = (field, value) => onChange(index, field, value);
  return (
    <section className="dc-witness">
      <div className="dc-witness-heading">
        <strong>WITNESS {index + 1}</strong>
        {canRemove && (
          <button type="button" className="no-print dc-remove" onClick={() => onRemove(index)} title="Remove witness">
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      <div className="dc-name-grid">
        <label><LineInput value={witness.last_name} onChange={(v) => set('last_name', v)} ariaLabel={`Witness ${index + 1} last name`} /><small>LAST NAME</small></label>
        <label><LineInput value={witness.first_name} onChange={(v) => set('first_name', v)} ariaLabel={`Witness ${index + 1} first name`} /><small>FIRST NAME</small></label>
        <label><LineInput value={witness.middle_name} onChange={(v) => set('middle_name', v)} ariaLabel={`Witness ${index + 1} middle name`} /><small>MIDDLE NAME</small></label>
      </div>
      <label><LineInput value={witness.street_address} onChange={(v) => set('street_address', v)} ariaLabel={`Witness ${index + 1} address`} /><small>STREET ADDRESS/LOCATION WHERE WITNESS MAY BE FOUND</small></label>
      <label><LineInput value={witness.city_state_zip} onChange={(v) => set('city_state_zip', v)} ariaLabel={`Witness ${index + 1} city state zip`} /><small>CITY / STATE / ZIP CODE</small></label>
      <div className="dc-locality-line">
        <Choice name={`witness-locality-${index}`} checked={witness.locality_type === 'city'} onChange={() => set('locality_type', 'city')} label="City of" />
        <Choice name={`witness-locality-${index}`} checked={witness.locality_type === 'county'} onChange={() => set('locality_type', 'county')} label="County" />
        <LineInput value={witness.locality_name} onChange={(v) => set('locality_name', v)} ariaLabel={`Witness ${index + 1} locality name`} />
      </div>
      <div className="dc-phone-line">
        <span>Telephone</span>
        <span>(</span><LineInput className="dc-area" value={witness.phone_area} onChange={(v) => set('phone_area', v)} ariaLabel="Area code" /><span>)</span>
        <LineInput value={witness.phone_number} onChange={(v) => set('phone_number', v)} ariaLabel="Phone number" />
        <small>AREA CODE</small>
      </div>
    </section>
  );
}

function CaptionPanel({ form, setField }) {
  const behalf = [
    ['commonwealth', 'Commonwealth'], ['locality', 'City / County / Town'],
    ['plaintiff', 'Plaintiff(s)'], ['defendant', 'Defendant(s)'],
    ['juvenile', 'Juvenile'], ['petitioner', 'Petitioner'], ['respondent', 'Respondent'],
  ];
  return (
    <section className="dc-caption">
      <div className="dc-case-number">Case No. <LineInput value={form.case_number} onChange={(v) => setField('case_number', v)} /></div>
      <h2>REQUEST FOR WITNESS SUBPOENA</h2>
      <div className="dc-rule" />
      <Choice name="jurisdiction" checked={form.jurisdiction_type === 'commonwealth'} onChange={() => setField('jurisdiction_type', 'commonwealth')} label="Commonwealth of Virginia" />
      <div className="dc-locality-request">
        <Choice name="jurisdiction" checked={form.jurisdiction_type === 'locality'} onChange={() => setField('jurisdiction_type', 'locality')} label="" />
        <select value={form.locality_type} onChange={(e) => setField('locality_type', e.target.value)} aria-label="Locality type">
          <option value="city">City</option><option value="county">County</option><option value="town">Town</option>
        </select>
        <span>of</span>
        <LineInput value={form.locality_name} onChange={(v) => setField('locality_name', v)} ariaLabel="Locality name" />
      </div>
      <label className="dc-caption-name">
        <textarea value={form.plaintiff_petitioner_name} onChange={(e) => setField('plaintiff_petitioner_name', e.target.value)} aria-label="Plaintiff or petitioner name" />
        <small>PLAINTIFF(S) / PETITIONER</small>
      </label>
      <div className="dc-center-choices">
        <Choice name="caption" checked={form.case_caption_type === 'versus'} onChange={() => setField('case_caption_type', 'versus')} label="v." />
        <Choice name="caption" checked={form.case_caption_type === 'in_re'} onChange={() => setField('case_caption_type', 'in_re')} label="In re" />
      </div>
      <label className="dc-caption-name">
        <LineInput value={form.defendant_child_name} onChange={(v) => setField('defendant_child_name', v)} ariaLabel="Defendant or child name" />
        <small>DEFENDANT / CHILD (ONE DEFENDANT ONLY)</small>
      </label>
      <label className="dc-caption-name">
        <textarea className="dc-charge" value={form.charge} onChange={(e) => setField('charge', e.target.value)} aria-label="Charge" />
        <small>CHARGE</small>
      </label>
      <div className="dc-court-date">
        <label><LineInput type="date" value={form.court_date} onChange={(v) => setField('court_date', v)} /><small>COURT DATE</small></label>
        <label><LineInput type="time" value={form.court_time} onChange={(v) => setField('court_time', v)} /><small>TIME</small></label>
        <select value={form.court_time_period} onChange={(e) => setField('court_time_period', e.target.value)} aria-label="AM or PM">
          <option>AM</option><option>PM</option>
        </select>
      </div>
      <h3>REQUEST ON BEHALF OF:</h3>
      <div className="dc-behalf-grid">
        {behalf.map(([value, label]) => (
          <Choice key={value} name="behalf" checked={form.requested_on_behalf_of === value} onChange={() => setField('requested_on_behalf_of', value)} label={label} />
        ))}
      </div>
      <h3>REQUESTED BY:</h3>
      <label><LineInput value={form.requested_by_name} onChange={(v) => setField('requested_by_name', v)} /><small>PRINTED NAME</small></label>
      <label className="dc-signature-line">
        {form.requested_by_signature_url ? <img src={form.requested_by_signature_url} alt="Requestor signature" /> : null}
        <small>SIGNATURE</small>
      </label>
      <div className="dc-phone-line dc-request-phone">
        <span>Telephone</span>
        <span>(</span><LineInput className="dc-area" value={form.requested_by_phone_area} onChange={(v) => setField('requested_by_phone_area', v)} /><span>)</span>
        <LineInput value={form.requested_by_phone_number} onChange={(v) => setField('requested_by_phone_number', v)} />
      </div>
      <div className="dc-court-use">
        <strong>COURT USE ONLY</strong>
        <label><LineInput type="date" value={form.date_received} onChange={(v) => setField('date_received', v)} /><small>DATE RECEIVED</small></label>
        <label><LineInput type="date" value={form.date_issued} onChange={(v) => setField('date_issued', v)} /><small>DATE ISSUED</small></label>
      </div>
    </section>
  );
}

function FirstPage({ form, setField, onWitnessChange, onRemove }) {
  return (
    <article className="dc325-page">
      <div className="dc-left">
        <header className="dc-header">
          <div>
            <h1>REQUEST FOR WITNESS SUBPOENA</h1>
            <p>COMMONWEALTH OF VIRGINIA</p>
          </div>
          <div className="dc-code">VA. CODE §§ 8.01-407, 16.1-265,<br />17.1-617, 19.2-267<br />Rules 3A:12, 7A:12, 8:13</div>
        </header>
        <div className="dc-please">(PLEASE PRINT)</div>
        <label className="dc-court-location">
          <LineInput value={form.court_location} onChange={(v) => setField('court_location', v)} ariaLabel="City or county" />
          <small>CITY OR COUNTY</small>
        </label>
        <div className="dc-court-types">
          <Choice name="court-type" checked={form.court_type === 'general_district'} onChange={() => setField('court_type', 'general_district')} label="GENERAL DISTRICT COURT" />
          <span className="dc-case-types">
            {['civil', 'criminal', 'traffic'].map((value) => (
              <Choice key={value} name="case-type" checked={form.general_case_type === value} onChange={() => { setField('court_type', 'general_district'); setField('general_case_type', value); }} label={value[0].toUpperCase() + value.slice(1)} />
            ))}
          </span>
          <Choice name="court-type" checked={form.court_type === 'juvenile_domestic'} onChange={() => setField('court_type', 'juvenile_domestic')} label="JUVENILE AND DOMESTIC RELATIONS DISTRICT COURT" />
        </div>
        <p className="dc-instructions">
          The clerk of the above-named court will issue a subpoena for the witnesses named below to appear at the court date and time shown.
          Submit this request to the clerk at least ten days before trial or hearing, when practicable.
        </p>
        <div className="dc-witness-grid">
          {form.witnesses.slice(0, 4).map((witness, index) => (
            <WitnessBox key={index} witness={witness} index={index} onChange={onWitnessChange} onRemove={onRemove} canRemove={false} />
          ))}
        </div>
        <footer><span>FORM DC-325</span><span>REVISED 10/08</span></footer>
      </div>
      <CaptionPanel form={form} setField={setField} />
    </article>
  );
}

function ContinuationPage({ form, witnesses, startIndex, onWitnessChange, onRemove }) {
  return (
    <article className="dc325-page dc-continuation">
      <header>
        <div><h1>REQUEST FOR WITNESS SUBPOENA</h1><p>WITNESS CONTINUATION SHEET</p></div>
        <div><strong>Case No.</strong> {form.case_number || '__________________'}<br /><strong>Court:</strong> {form.court_location || '__________________'}</div>
      </header>
      <p>Additional witnesses requested in the matter of <strong>{form.plaintiff_petitioner_name || '__________________'}</strong> {form.case_caption_type === 'in_re' ? 'In re' : 'v.'} <strong>{form.defendant_child_name || '__________________'}</strong></p>
      <div className="dc-witness-grid">
        {witnesses.map((witness, offset) => (
          <WitnessBox key={startIndex + offset} witness={witness} index={startIndex + offset} onChange={onWitnessChange} onRemove={onRemove} canRemove />
        ))}
      </div>
      <footer><span>FORM DC-325 - ATTACHMENT</span><span>Witness continuation</span></footer>
    </article>
  );
}

export default function WitnessSubpoenaRequest() {
  const [form, setForm] = useState(initialForm);
  const [recordId, setRecordId] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentDirectoryUser });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['witnessSubpoenaRequests', user?.id],
    queryFn: () => loadLegalRecordHistory('subpoena'),
    enabled: !!user,
    staleTime: 15000,
  });

  const visibleRecords = records;

  useEffect(() => {
    if (!recordId && user) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || '';
      setForm((current) => current.requested_by_name ? current : { ...current, requested_by_name: fullName, requested_by_phone_number: user.phone || '' });
    }
  }, [user, recordId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, witnesses: form.witnesses.map(({ ...witness }) => witness) };
      return recordId
        ? updateLegalRecord('subpoena', recordId, payload)
        : base44.entities.WitnessSubpoenaRequest.create(payload);
    },
    onSuccess: (saved) => {
      setRecordId(saved?.id || recordId);
      queryClient.invalidateQueries({ queryKey: ['witnessSubpoenaRequests'] });
      toast.success('Witness subpoena request saved.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to save this request.'),
  });

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateWitness = (index, field, value) => setForm((current) => ({
    ...current,
    witnesses: current.witnesses.map((witness, witnessIndex) => witnessIndex === index ? { ...witness, [field]: value } : witness),
  }));
  const addWitness = () => setForm((current) => ({ ...current, witnesses: [...current.witnesses, blankWitness()] }));
  const removeWitness = (index) => setForm((current) => ({
    ...current,
    witnesses: current.witnesses.length <= 1 ? current.witnesses : current.witnesses.filter((_, witnessIndex) => witnessIndex !== index),
  }));

  const openRecord = (record) => {
    const loadedWitnesses = Array.isArray(record.witnesses) ? record.witnesses.map((witness) => ({ ...blankWitness(), ...witness })) : [];
    while (loadedWitnesses.length < 4) loadedWitnesses.push(blankWitness());
    setRecordId(record.id);
    setForm({ ...initialForm(), ...record, witnesses: loadedWitnesses });
    setShowSaved(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const newRequest = () => {
    if (!window.confirm('Start a new request? Any unsaved changes on this form will be cleared.')) return;
    const next = initialForm();
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || '';
    setForm({ ...next, requested_by_name: fullName, requested_by_phone_number: user?.phone || '' });
    setRecordId(null);
  };

  const continuationGroups = [];
  for (let index = 4; index < form.witnesses.length; index += 4) {
    continuationGroups.push({ startIndex: index, witnesses: form.witnesses.slice(index, index + 4) });
  }

  return (
    <div className="dc325-page-shell w-full min-h-screen pb-10">
      <style>{`
        .dc325-page-shell { background:radial-gradient(circle at 18% 0%,#132a42 0,#0b1420 42%,#08111d 100%) !important; }
        .dc325-workspace { --ink:#eaf2f9; color:var(--ink); }
        .dc-toolbar { position:sticky; top:0; z-index:20; display:flex; flex-wrap:wrap; gap:.55rem; align-items:center; padding:1rem; background:rgba(8,17,29,.94) !important; border-bottom:1px solid #29465f !important; box-shadow:0 12px 34px rgba(0,0,0,.28); backdrop-filter:blur(14px); }
        .dc-toolbar-copy { margin-right:auto; min-width:240px; }
        .dc-toolbar-copy h1 { margin:0; font-size:1.15rem; font-weight:800; color:#f8fafc !important; letter-spacing:normal !important; }
        .dc-toolbar-copy p { margin:.15rem 0 0; font-size:.78rem; color:#9fb5c9 !important; }
        .dc-toolbar .dc-toolbar-secondary { background:#111d2b !important; color:#dcecff !important; border-color:#334c64 !important; }
        .dc-toolbar .dc-toolbar-secondary:hover { background:#173d5a !important; color:#fff !important; border-color:#4d7799 !important; }
        .dc-toolbar .dc-toolbar-primary { background:linear-gradient(135deg,#1676ad,#0d4f7a) !important; color:#fff !important; border-color:#2d8fc4 !important; box-shadow:0 8px 18px rgba(14,116,173,.24); }
        .dc-toolbar .dc-toolbar-primary:hover { background:linear-gradient(135deg,#2090cf,#12618f) !important; color:#fff !important; }
        .dc-saved { margin:1rem; padding:1rem; border:1px solid #2b4158; border-radius:.8rem; background:#0d1825 !important; color:#eaf2f9 !important; box-shadow:0 14px 34px rgba(0,0,0,.22); }
        .dc-saved-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:.65rem; }
        .dc-saved-card { text-align:left; border:1px solid #2f4962 !important; border-radius:.6rem; padding:.75rem; background:#111d2b !important; color:#eaf2f9 !important; }
        .dc-saved-card :is(strong,span) { color:inherit !important; }
        .dc-saved-card:hover { border-color:#3b9bce !important; background:#15314a !important; }
        .dc-paper-scroll { overflow-x:auto; padding:1rem; }
        .subpoena-print-root { width:max-content; margin:0 auto; }
        .dc325-page { width:10.55in; height:8.05in; box-sizing:border-box; display:grid; grid-template-columns:66.2% 33.8%; background:#0d1825 !important; color:#eaf2f9 !important; color-scheme:dark !important; font-family:Arial,Helvetica,sans-serif; font-size:9.6px; line-height:1.15; border:1px solid #334c64 !important; border-top:3px solid #2b8fc3 !important; box-shadow:0 20px 52px rgba(0,0,0,.38),0 0 0 1px rgba(56,137,181,.12); margin:0 auto 1rem; overflow:hidden; }
        .dc325-page :is(h1,h2,h3,p,span,strong,small,label,footer) { color:#eaf2f9 !important; }
        .dc-left { padding:.2in .14in .12in .18in; border-right:2px solid #000; display:flex; flex-direction:column; min-width:0; }
        .dc-header { display:grid; grid-template-columns:1fr auto; align-items:start; text-align:center; }
        .dc-header h1,.dc-continuation h1 { margin:0; font-size:20px !important; line-height:1.1 !important; letter-spacing:.02em !important; }
        .dc-header p,.dc-continuation header p { margin:2px 0; font-size:11px; font-weight:700; }
        .dc-code { text-align:right; font-size:8px; line-height:1.25; }
        .dc-please { text-align:center; font-size:8px; margin:1px 0 2px; }
        .dc325-page .dc-line-input { width:100%; min-width:0; min-height:0 !important; height:20px !important; padding:2px 3px 0; border:0 !important; border-bottom:1px solid #4d7294 !important; border-radius:0 !important; outline:none; background:rgba(4,12,21,.34) !important; color:#f8fafc !important; font:inherit; font-size:10px !important; box-sizing:border-box; box-shadow:none !important; }
        .dc325-page .dc-line-input:focus, .dc325-page textarea:focus, .dc325-page select:focus { background:#122c42 !important; outline:1px solid #38a0d4 !important; outline-offset:-1px; }
        .dc325-page label { min-width:0; }
        .dc325-page label small { display:block; font-size:6.8px; line-height:1.05; text-align:center; margin-top:1px; font-weight:400; }
        .dc-court-location { display:block; width:68%; margin:0 auto 3px; }
        .dc-court-types { display:grid; grid-template-columns:1.2fr 1fr; gap:2px 8px; border:1px solid #000; padding:3px 5px; }
        .dc-court-types > .dc-choice:last-child { grid-column:1 / -1; }
        .dc-case-types { display:flex; justify-content:space-between; gap:4px; }
        .dc-choice { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; cursor:pointer; }
        .dc325-page .dc-choice input { width:11px !important; height:11px !important; min-height:0 !important; margin:0; padding:0 !important; border-radius:50% !important; background:#0b1420 !important; accent-color:#38a0d4; box-shadow:none !important; }
        .dc-instructions { margin:3px 0; font-size:7.5px; text-align:justify; }
        .dc-witness-grid { flex:1; display:grid; grid-template-columns:1fr 1fr; grid-auto-rows:1fr; border-top:1px solid #000; border-left:1px solid #000; min-height:0; }
        .dc-witness { min-width:0; padding:3px 5px; border-right:1px solid #000; border-bottom:1px solid #000; display:flex; flex-direction:column; justify-content:space-between; }
        .dc-witness-heading { display:flex; align-items:center; justify-content:space-between; font-size:8px; min-height:16px; }
        .dc-remove { display:inline-flex; align-items:center; gap:2px; border:0; background:transparent; color:#b91c1c; font-size:8px; cursor:pointer; }
        .dc-name-grid { display:grid; grid-template-columns:1.1fr 1fr .8fr; gap:3px; }
        .dc-locality-line,.dc-phone-line { display:flex; align-items:end; gap:3px; }
        .dc-locality-line .dc-line-input { flex:1; }
        .dc-phone-line .dc-line-input { flex:1; }
        .dc-phone-line small { font-size:6px; white-space:nowrap; }
        .dc-phone-line .dc-area { width:34px; flex:0 0 34px; text-align:center; }
        footer { display:flex; justify-content:space-between; padding-top:3px; font-size:7px; }
        .dc-caption { padding:.18in .15in .12in; display:flex; flex-direction:column; gap:3px; min-width:0; }
        .dc-case-number { display:flex; align-items:end; gap:4px; font-weight:700; font-size:10px; }
        .dc-caption h2 { font-size:14px; margin:2px 0; text-align:center; }
        .dc-rule { border-top:2px solid #000; }
        .dc-locality-request { display:flex; align-items:end; gap:3px; }
        .dc325-page .dc-locality-request select,.dc325-page .dc-caption select { min-height:0 !important; border:0 !important; border-bottom:1px solid #4d7294 !important; border-radius:0 !important; background:#101f2e !important; color:#f8fafc !important; font:inherit; font-size:10px !important; height:20px !important; padding:0 2px !important; box-shadow:none !important; }
        .dc325-page .dc-caption-name textarea { width:100%; min-height:48px !important; height:48px !important; resize:none; padding:4px; border:1px solid #3f617f !important; border-radius:4px !important; background:#101f2e !important; color:#f8fafc !important; font:inherit; font-size:10px !important; box-sizing:border-box; box-shadow:inset 0 1px 0 rgba(255,255,255,.03) !important; }
        .dc325-page .dc-caption-name textarea.dc-charge { min-height:38px !important; height:38px !important; }
        .dc-center-choices { display:flex; gap:24px; justify-content:center; }
        .dc-court-date { display:grid; grid-template-columns:1.25fr 1fr auto; gap:4px; align-items:start; }
        .dc-caption h3 { margin:2px 0 0; font-size:9px; }
        .dc-behalf-grid { display:grid; grid-template-columns:1fr 1fr; gap:3px 5px; }
        .dc-signature-line { position:relative; display:block; height:37px; border-bottom:1px solid #000; }
        .dc-signature-line img { width:100%; height:30px; object-fit:contain; object-position:left bottom; mix-blend-mode:multiply; }
        .dc-signature-line small { position:absolute; left:0; right:0; bottom:-9px; }
        .dc-request-phone { margin-top:8px; }
        .dc-court-use { margin-top:auto; border:1px solid #000; padding:4px; display:grid; grid-template-columns:auto 1fr 1fr; align-items:end; gap:5px; }
        .dc-court-use strong { font-size:8px; align-self:center; }
        .dc-continuation { display:flex; flex-direction:column; padding:.25in; }
        .dc-continuation header { display:flex; justify-content:space-between; align-items:start; border-bottom:2px solid #000; padding-bottom:6px; }
        .dc-continuation > p { font-size:10px; margin:7px 0; }
        .dc-continuation .dc-witness-grid { min-height:0; }
        .dc-signature-panel { max-width:700px; margin:1rem auto; padding:0 1rem; }
        @media screen {
          .dc-left { border-right-color:#3a526b !important; }
          .dc-court-types,.dc-witness-grid,.dc-witness,.dc-rule,.dc-signature-line,.dc-court-use,.dc-continuation header { border-color:#3a526b !important; }
          .dc-witness:nth-child(odd) { background:rgba(17,29,43,.38); }
          .dc-caption { background:linear-gradient(180deg,rgba(20,40,59,.46),rgba(9,20,32,.25)); }
          .dc-header h1,.dc-caption h2,.dc-witness-heading strong { color:#8bd7ff !important; }
          .dc-code,.dc-please,.dc325-page label small,.dc-caption h3 { color:#9fb5c9 !important; }
          .dc-instructions { color:#c7d6e5 !important; }
          .dc325-page input::-webkit-calendar-picker-indicator { filter:invert(1) brightness(1.45) !important; }
        }
        @media (max-width:1279px) {
          #dc325-form .dc-line-input { min-height:0 !important; height:20px !important; font-size:10px !important; }
          #dc325-form .dc-caption-name textarea { min-height:48px !important; height:48px !important; font-size:10px !important; }
          #dc325-form .dc-caption-name textarea.dc-charge { min-height:38px !important; height:38px !important; }
          #dc325-form select { min-height:0 !important; height:20px !important; font-size:10px !important; }
        }
        @media (max-width:700px) {
          .dc-toolbar { position:relative; }
          .dc-toolbar .btn-label { display:none; }
          .dc-paper-scroll { padding:.5rem; }
        }
        @page { size:letter landscape; margin:.22in; }
        @media print {
          body { margin:0 !important; background:white !important; }
          body * { visibility:hidden !important; }
          .subpoena-print-root,.subpoena-print-root * { visibility:visible !important; }
          .subpoena-print-root { position:absolute; left:0; top:0; width:100%; margin:0; }
          .no-print { display:none !important; }
          .dc-paper-scroll { overflow:visible; padding:0; }
          #dc325-form .dc325-page { width:10.55in; height:8.05in; margin:0; border:0 !important; border-top:0 !important; box-shadow:none !important; break-after:page; page-break-after:always; background:#fff !important; color:#000 !important; color-scheme:light !important; -webkit-print-color-adjust:economy !important; print-color-adjust:economy !important; }
          #dc325-form .dc325-page:last-child { break-after:auto; page-break-after:auto; }
          #dc325-form .dc325-page, #dc325-form .dc325-page * { color:#000 !important; background-color:transparent !important; background-image:none !important; box-shadow:none !important; text-shadow:none !important; color-scheme:light !important; }
          #dc325-form .dc325-page { background:#fff !important; }
          #dc325-form .dc-left,#dc325-form .dc-court-types,#dc325-form .dc-witness-grid,#dc325-form .dc-witness,#dc325-form .dc-rule,#dc325-form .dc-signature-line,#dc325-form .dc-court-use,#dc325-form .dc-continuation header { border-color:#000 !important; }
          #dc325-form .dc325-page .dc-line-input { background:transparent !important; border:0 !important; border-bottom:1px solid #000 !important; border-radius:0 !important; }
          #dc325-form .dc325-page textarea { background:transparent !important; border:1px solid #000 !important; border-radius:0 !important; }
          #dc325-form .dc325-page select { background:transparent !important; border:0 !important; border-bottom:1px solid #000 !important; border-radius:0 !important; appearance:none !important; -webkit-appearance:none !important; }
          #dc325-form .dc325-page input[type="radio"],#dc325-form .dc325-page input[type="checkbox"] { appearance:auto !important; -webkit-appearance:auto !important; background:#fff !important; accent-color:#000 !important; }
          #dc325-form .dc325-page input::-webkit-calendar-picker-indicator { filter:none !important; }
          input::placeholder,textarea::placeholder { color:transparent !important; }
        }
      `}</style>

      <div className="dc325-workspace">
        <div className="dc-toolbar no-print">
          <div className="dc-toolbar-copy">
            <h1>Virginia DC-325 · Request for Witness Subpoena</h1>
            <p>{recordId ? 'Editing saved request' : 'New request'} · {form.witnesses.length} witness{form.witnesses.length === 1 ? '' : 'es'} · continuation pages are automatic</p>
          </div>
          <Button type="button" variant="outline" className="dc-toolbar-secondary" onClick={newRequest}><FilePlus2 size={16} className="mr-2" /><span className="btn-label">New</span></Button>
          <Button type="button" variant="outline" className="dc-toolbar-secondary" onClick={() => setShowSaved((value) => !value)}><FolderOpen size={16} className="mr-2" /><span className="btn-label">History ({visibleRecords.length})</span></Button>
          <Button type="button" variant="outline" className="dc-toolbar-secondary" onClick={addWitness}><Plus size={16} className="mr-2" /><span className="btn-label">Add witness</span></Button>
          <Button type="button" variant="outline" className="dc-toolbar-secondary" onClick={() => setShowSignature(true)}><PenTool size={16} className="mr-2" /><span className="btn-label">{form.requested_by_signature_url ? 'Replace signature' : 'Sign'}</span></Button>
          <Button type="button" className="dc-toolbar-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save size={16} className="mr-2" /><span className="btn-label">{saveMutation.isPending ? 'Saving…' : 'Save draft'}</span></Button>
          <Button type="button" className="dc-toolbar-primary" onClick={() => { try { printDc325(form); } catch (error) { toast.error(error?.message || 'Unable to open the DC-325 print document.'); } }}><Printer size={16} className="mr-2" /><span className="btn-label">Print Official DC-325</span></Button>
        </div>

        <section className="no-print mx-auto grid max-w-6xl gap-4 px-4 pt-4 lg:grid-cols-2">
          <ActiveCallLinkField formData={form} setFormData={setForm} label="Link witness subpoena to Call for Service" />
          <LinkedLegalRecordField formData={form} setFormData={setForm} />
        </section>

        {showSaved && (
          <section className="dc-saved no-print">
            <div className="flex items-center gap-2 mb-3"><Users size={18} /><strong>Witness subpoena submission history</strong></div>
            {isLoading ? <p>Loading saved requests…</p> : visibleRecords.length === 0 ? <p className="text-sm text-slate-500">No saved requests yet.</p> : (
              <div className="dc-saved-grid">
                {visibleRecords.map((record) => (
                  <button type="button" key={record.id} className="dc-saved-card" onClick={() => openRecord(record)}>
                    <strong className="block">{record.case_number || 'No case number'}</strong>
                    <span className="block text-sm text-slate-600 truncate">{record.defendant_child_name || record.plaintiff_petitioner_name || 'Untitled request'}</span>
                    <span className="block text-xs text-slate-500 mt-1">{record.witnesses?.length || 0} witness{record.witnesses?.length === 1 ? '' : 'es'} · {record.status || 'draft'}</span>
                    {record.linked_legal_record_number && <span className="block text-xs text-violet-300 mt-1">Linked: {record.linked_legal_record_number}</span>}
                    {record.linked_call_number && <span className="block text-xs text-cyan-300 mt-1">CAD: {record.linked_call_number}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {showSignature && (
          <div className="dc-signature-panel no-print">
            <SignaturePad
              officerName={form.requested_by_name || 'Requestor'}
              onSignatureComplete={(url) => { setField('requested_by_signature_url', url); setShowSignature(false); }}
              onClose={() => setShowSignature(false)}
            />
          </div>
        )}

        <section className="no-print mx-auto max-w-6xl px-4 pt-4">
          <LegalCaseHistoryPanel audience={user?.role === 'admin' ? 'admin' : 'officer'} title={user?.role === 'admin' ? 'All Enforcement Case History' : 'My Enforcement Case History'} limit={75} />
        </section>

        <div className="dc-paper-scroll">
          <main id="dc325-form" className="subpoena-print-root">
            <FirstPage form={form} setField={setField} onWitnessChange={updateWitness} onRemove={removeWitness} />
            {continuationGroups.map((group) => (
              <ContinuationPage key={group.startIndex} form={form} witnesses={group.witnesses} startIndex={group.startIndex} onWitnessChange={updateWitness} onRemove={removeWitness} />
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
