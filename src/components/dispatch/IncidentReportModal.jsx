import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, FileText, Shield, Send, Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const FIELD = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            {label}{required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const inputClass = "bg-slate-800 border-slate-600 text-white text-sm placeholder-slate-500 focus:border-blue-500";

const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export default function IncidentReportModal({ call, currentUser, onClose }) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);

    const [form, setForm] = useState({
        report_number: `RPT-${Date.now().toString().slice(-6)}`,
        call_number: call?.call_id || call?.id || '',
        incident_date: dateStr,
        incident_time: timeStr,
        location: call?.location || '',
        incident_type: call?.incident || '',
        description: call?.description || '',
        victims: [{ name: '', dob: '', dl_number: '', dl_state: '' }],
        witnesses: [{ name: '', dob: '', dl_number: '', dl_state: '' }],
        suspects: [{ name: '', dob: '', ssn: '', dl_number: '', dl_state: '' }],
        suspect_vehicles: [{ year: '', make: '', model: '', color: '', plate: '', state: '' }],
        action_taken: '',
        severity: 'Minor',
        police_notified: false,
        ems_notified: false,
        fire_notified: false,
        subject_trespassed: false,
        reporting_officer: currentUser?.rank && currentUser?.last_name
            ? `${currentUser.rank} ${currentUser.last_name}`
            : currentUser?.full_name || '',
        badge_number: currentUser?.badge_number || '',
    });

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const updatePerson = (type, index, field, value) => {
        setForm(prev => {
            const updated = [...prev[type]];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, [type]: updated };
        });
    };

    const addPerson = (type) => {
        setForm(prev => ({
            ...prev,
            [type]: [...prev[type], type === 'suspect_vehicles' ? { year: '', make: '', model: '', color: '', plate: '', state: '' } : { name: '', dob: '', dl_number: '', dl_state: '', ...(type === 'suspects' && { ssn: '' }) }]
        }));
    };

    const removePerson = (type, index) => {
        setForm(prev => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        if (!form.incident_type || !form.location) {
            toast.error('Incident type and location are required');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                report_number: form.report_number,
                call_number: form.call_number,
                incident_date: form.incident_date,
                incident_time: form.incident_time,
                location: form.location,
                incident_type: form.incident_type,
                description: form.description,
                severity: form.severity,
                victims: form.victims.filter(v => v.name),
                witnesses: form.witnesses.filter(w => w.name),
                suspects: form.suspects.filter(s => s.name),
                suspect_vehicles: form.suspect_vehicles.filter(v => v.make),
                action_taken: form.action_taken,
                police_notified: form.police_notified,
                ems_notified: form.ems_notified,
                fire_notified: form.fire_notified,
                subject_trespassed: form.subject_trespassed,
                reporting_officer: form.reporting_officer,
                badge_number: form.badge_number,
                report_type: 'IncidentReport',
                linked_call: call ? {
                    id: call.id,
                    call_id: call.call_id,
                    incident: call.incident,
                    location: call.location,
                    agency: call.agency,
                    status: call.status,
                    time_received: call.time_received,
                    description: call.description,
                    priority: call.priority,
                } : null,
                status: 'Pending Review',
                submitted_by: currentUser?.email || currentUser?.full_name,
            };

            const res = await base44.functions.invoke('sendReportToLinkedApp', payload);

            if (res.data?.success) {
                const linkedCallId = call?.original_call_id || call?.id || '';
                const linkedCallNumber = call?.call_id || call?.agency_cad_number || call?.bps_reference || linkedCallId;
                try {
                    const existing = linkedCallId
                        ? await base44.entities.IncidentReport.filter({ linked_call_id: linkedCallId }, '-created_date', 10)
                        : [];
                    if (!existing.some(report => report.status !== 'draft')) {
                        await base44.entities.IncidentReport.create({
                            report_number: form.report_number,
                            call_number: linkedCallNumber || form.call_number,
                            linked_call_id: linkedCallId,
                            linked_call_number: linkedCallNumber,
                            incident_date: form.incident_date,
                            incident_time: form.incident_time,
                            location: form.location,
                            incident_type: 'other',
                            description: form.description || `${call?.incident || 'Property call'} incident report`,
                            action_taken: form.action_taken || '',
                            police_notified: !!form.police_notified,
                            ems_notified: !!form.ems_notified,
                            fire_notified: !!form.fire_notified,
                            status: 'submitted',
                            primary_officer_id: currentUser?.id || '',
                            primary_officer_name: form.reporting_officer || currentUser?.full_name || '',
                        });
                    }
                } catch (localLinkError) {
                    console.error('Linked app report succeeded but local IncidentReport link failed:', localLinkError);
                    toast.warning('Report was sent, but local performance linkage could not be confirmed.');
                }
                setSubmitted(true);
                toast.success('Incident Report submitted successfully');
            } else {
                throw new Error(res.data?.error || 'Submission failed');
            }
        } catch (err) {
            toast.error(`Failed to submit: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-950 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-mono font-bold text-base tracking-wider">
                                LAW ENFORCEMENT REPORT
                            </h2>
                            <p className="text-slate-400 text-xs font-mono">
                                Linked to: {call?.call_id || call?.id || 'N/A'} • {call?.incident} • {call?.location}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {submitted ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
                        <CheckCircle2 className="w-16 h-16 text-green-400" />
                        <p className="text-white font-mono text-xl font-bold">REPORT SUBMITTED</p>
                        <p className="text-slate-400 font-mono text-sm">Report #{form.report_number} has been sent for approval.</p>
                        <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 font-mono mt-4">CLOSE</Button>
                    </div>
                ) : (
                    <>
                        {/* Form Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* Report Header Fields */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-900 border border-slate-700 rounded-lg">
                                <FIELD label="Report Number" required>
                                    <Input value={form.report_number} onChange={e => set('report_number', e.target.value)} className={inputClass} />
                                </FIELD>
                                <FIELD label="Incident Date" required>
                                    <Input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)} className={inputClass} />
                                </FIELD>
                                <FIELD label="Incident Time" required>
                                    <Input type="time" value={form.incident_time} onChange={e => set('incident_time', e.target.value)} className={inputClass} />
                                </FIELD>
                            </div>

                            {/* Incident Info */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono border-b border-slate-700 pb-2">
                                    ① INCIDENT INFORMATION
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <FIELD label="Incident / Offense Type" required>
                                        <Input value={form.incident_type} onChange={e => set('incident_type', e.target.value)} className={inputClass} placeholder="e.g. Trespassing, Assault..." />
                                    </FIELD>
                                    <FIELD label="Severity">
                                        <select value={form.severity} onChange={e => set('severity', e.target.value)}
                                            className="w-full h-9 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 focus:border-blue-500 outline-none">
                                            {['Minor', 'Moderate', 'Serious', 'Critical'].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                    </FIELD>
                                </div>
                                <FIELD label="Location / Address" required>
                                    <Input value={form.location} onChange={e => set('location', e.target.value)} className={inputClass} />
                                </FIELD>
                                <FIELD label="Narrative / Description">
                                    <Textarea value={form.description} onChange={e => set('description', e.target.value)}
                                        className={inputClass} rows={4} placeholder="Describe the incident in detail..." />
                                </FIELD>
                            </div>

                            {/* Victims */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">② VICTIMS</h3>
                                    <Button size="sm" onClick={() => addPerson('victims')} className="bg-blue-700 hover:bg-blue-600 h-7 px-2">
                                        <Plus className="w-3 h-3 mr-1" /> ADD VICTIM
                                    </Button>
                                </div>
                                {form.victims.map((victim, idx) => (
                                    <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded p-3 space-y-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400 font-mono">Victim #{idx + 1}</span>
                                            {form.victims.length > 1 && (
                                                <button onClick={() => removePerson('victims', idx)} className="text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input placeholder="Name" value={victim.name} onChange={e => updatePerson('victims', idx, 'name', e.target.value)} className={inputClass} />
                                            <Input type="date" placeholder="DOB" value={victim.dob} onChange={e => updatePerson('victims', idx, 'dob', e.target.value)} className={inputClass} />
                                            <Input placeholder="DL Number" value={victim.dl_number} onChange={e => updatePerson('victims', idx, 'dl_number', e.target.value)} className={inputClass} />
                                            <select value={victim.dl_state} onChange={e => updatePerson('victims', idx, 'dl_state', e.target.value)} className="w-full h-9 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 focus:border-blue-500 outline-none">
                                                <option value="">DL State</option>
                                                {STATES.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Witnesses */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">③ WITNESSES</h3>
                                    <Button size="sm" onClick={() => addPerson('witnesses')} className="bg-blue-700 hover:bg-blue-600 h-7 px-2">
                                        <Plus className="w-3 h-3 mr-1" /> ADD WITNESS
                                    </Button>
                                </div>
                                {form.witnesses.map((witness, idx) => (
                                    <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded p-3 space-y-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400 font-mono">Witness #{idx + 1}</span>
                                            {form.witnesses.length > 1 && (
                                                <button onClick={() => removePerson('witnesses', idx)} className="text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input placeholder="Name" value={witness.name} onChange={e => updatePerson('witnesses', idx, 'name', e.target.value)} className={inputClass} />
                                            <Input type="date" placeholder="DOB" value={witness.dob} onChange={e => updatePerson('witnesses', idx, 'dob', e.target.value)} className={inputClass} />
                                            <Input placeholder="DL Number" value={witness.dl_number} onChange={e => updatePerson('witnesses', idx, 'dl_number', e.target.value)} className={inputClass} />
                                            <select value={witness.dl_state} onChange={e => updatePerson('witnesses', idx, 'dl_state', e.target.value)} className="w-full h-9 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 focus:border-blue-500 outline-none">
                                                <option value="">DL State</option>
                                                {STATES.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Suspects */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">④ SUSPECTS</h3>
                                    <Button size="sm" onClick={() => addPerson('suspects')} className="bg-blue-700 hover:bg-blue-600 h-7 px-2">
                                        <Plus className="w-3 h-3 mr-1" /> ADD SUSPECT
                                    </Button>
                                </div>
                                {form.suspects.map((suspect, idx) => (
                                    <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded p-3 space-y-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400 font-mono">Suspect #{idx + 1}</span>
                                            {form.suspects.length > 1 && (
                                                <button onClick={() => removePerson('suspects', idx)} className="text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input placeholder="Name" value={suspect.name} onChange={e => updatePerson('suspects', idx, 'name', e.target.value)} className={inputClass} />
                                            <Input type="date" placeholder="DOB" value={suspect.dob} onChange={e => updatePerson('suspects', idx, 'dob', e.target.value)} className={inputClass} />
                                            <Input placeholder="SSN (last 4)" value={suspect.ssn} onChange={e => updatePerson('suspects', idx, 'ssn', e.target.value)} className={inputClass} />
                                            <Input placeholder="DL Number" value={suspect.dl_number} onChange={e => updatePerson('suspects', idx, 'dl_number', e.target.value)} className={inputClass} />
                                            <select value={suspect.dl_state} onChange={e => updatePerson('suspects', idx, 'dl_state', e.target.value)} className="w-full h-9 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 focus:border-blue-500 outline-none col-span-2">
                                                <option value="">DL State</option>
                                                {STATES.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Suspect Vehicles */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
                                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">⑤ SUSPECT VEHICLES</h3>
                                    <Button size="sm" onClick={() => addPerson('suspect_vehicles')} className="bg-blue-700 hover:bg-blue-600 h-7 px-2">
                                        <Plus className="w-3 h-3 mr-1" /> ADD VEHICLE
                                    </Button>
                                </div>
                                {form.suspect_vehicles.map((vehicle, idx) => (
                                    <div key={idx} className="bg-slate-800/50 border border-slate-700 rounded p-3 space-y-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-slate-400 font-mono">Vehicle #{idx + 1}</span>
                                            {form.suspect_vehicles.length > 1 && (
                                                <button onClick={() => removePerson('suspect_vehicles', idx)} className="text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <Input placeholder="Year" value={vehicle.year} onChange={e => updatePerson('suspect_vehicles', idx, 'year', e.target.value)} className={inputClass} />
                                            <Input placeholder="Make" value={vehicle.make} onChange={e => updatePerson('suspect_vehicles', idx, 'make', e.target.value)} className={inputClass} />
                                            <Input placeholder="Model" value={vehicle.model} onChange={e => updatePerson('suspect_vehicles', idx, 'model', e.target.value)} className={inputClass} />
                                            <Input placeholder="Color" value={vehicle.color} onChange={e => updatePerson('suspect_vehicles', idx, 'color', e.target.value)} className={inputClass} />
                                            <Input placeholder="License Plate" value={vehicle.plate} onChange={e => updatePerson('suspect_vehicles', idx, 'plate', e.target.value)} className={inputClass} />
                                            <select value={vehicle.state} onChange={e => updatePerson('suspect_vehicles', idx, 'state', e.target.value)} className="w-full h-9 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-3 focus:border-blue-500 outline-none">
                                                <option value="">State</option>
                                                {STATES.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Action Taken */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono border-b border-slate-700 pb-2">
                                    ⑥ ACTION TAKEN
                                </h3>
                                <FIELD label="Action Taken">
                                    <Textarea value={form.action_taken} onChange={e => set('action_taken', e.target.value)}
                                        className={inputClass} rows={3} placeholder="Describe officer actions, arrests, citations, referrals..." />
                                </FIELD>
                                <div className="flex gap-6 flex-wrap">
                                    {[['police_notified', 'Police Notified'], ['ems_notified', 'EMS Notified'], ['fire_notified', 'Fire Notified'], ['subject_trespassed', 'Subject Was Trespassed']].map(([field, label]) => (
                                        <label key={field} className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={form[field]} onChange={e => set(field, e.target.checked)}
                                                className="w-4 h-4 accent-blue-500" />
                                            <span className="text-sm text-slate-300 font-mono">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Reporting Officer */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono border-b border-slate-700 pb-2">
                                    ⑦ REPORTING OFFICER
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <FIELD label="Officer Name">
                                        <Input value={form.reporting_officer} onChange={e => set('reporting_officer', e.target.value)} className={inputClass} />
                                    </FIELD>
                                    <FIELD label="Badge / ID Number">
                                        <Input value={form.badge_number} onChange={e => set('badge_number', e.target.value)} className={inputClass} />
                                    </FIELD>
                                </div>
                            </div>

                            {/* Linked Call Info (read-only) */}
                            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-center gap-3">
                                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                <div className="text-xs font-mono text-blue-300">
                                    <span className="font-bold">LINKED CALL:</span>{' '}
                                    {call?.call_id || call?.id} • {call?.incident} • {call?.agency} • {call?.location}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900 rounded-b-xl flex items-center justify-between gap-4">
                            <div className="text-xs font-mono text-slate-500">
                                Status: <span className="text-yellow-400">Pending Review</span> • Will be sent to approval system
                            </div>
                            <div className="flex gap-3">
                                <Button onClick={onClose} variant="outline" className="border-slate-700 text-slate-300 font-mono text-xs">
                                    CANCEL
                                </Button>
                                <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 font-mono text-xs">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                    {submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}