import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X, FileText, Shield, Send, Loader2, CheckCircle2 } from 'lucide-react';

const FIELD = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            {label}{required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const inputClass = "bg-slate-800 border-slate-600 text-white text-sm placeholder-slate-500 focus:border-blue-500";

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
        persons_involved: '',
        victims: '',
        witnesses: '',
        suspect_description: '',
        suspect_vehicle: '',
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

    const handleSubmit = async () => {
        if (!form.incident_type || !form.location) {
            toast.error('Incident type and location are required');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                ...form,
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
            <div className="bg-slate-950 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
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

                            {/* Persons */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono border-b border-slate-700 pb-2">
                                    ② PERSONS INVOLVED
                                </h3>
                                <FIELD label="Persons Involved">
                                    <Input
                                        value={form.persons_involved}
                                        onChange={e => set('persons_involved', e.target.value)}
                                        className={inputClass} placeholder="Full name(s), DOB, address..." />
                                </FIELD>
                                <FIELD label="Victims">
                                    <Input value={form.victims} onChange={e => set('victims', e.target.value)} className={inputClass} placeholder="Victim name(s), contact..." />
                                </FIELD>
                                <FIELD label="Witnesses">
                                    <Input value={form.witnesses} onChange={e => set('witnesses', e.target.value)} className={inputClass} placeholder="Witness name(s), contact..." />
                                </FIELD>
                                <FIELD label="Suspect Description">
                                    <Input value={form.suspect_description} onChange={e => set('suspect_description', e.target.value)} className={inputClass} placeholder="Height, weight, clothing, direction of travel..." />
                                </FIELD>
                                <FIELD label="Suspect Vehicle">
                                    <Input value={form.suspect_vehicle} onChange={e => set('suspect_vehicle', e.target.value)} className={inputClass} placeholder="Year, make, model, color, plate..." />
                                </FIELD>
                            </div>

                            {/* Action Taken */}
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-4">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono border-b border-slate-700 pb-2">
                                    ③ ACTION TAKEN
                                </h3>
                                <FIELD label="Action Taken">
                                    <Textarea value={form.action_taken} onChange={e => set('action_taken', e.target.value)}
                                        className={inputClass} rows={3} placeholder="Describe officer actions, arrests, citations, referrals..." />
                                </FIELD>
                                <div className="flex gap-6">
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
                                    ④ REPORTING OFFICER
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