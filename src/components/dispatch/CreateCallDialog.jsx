import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { X, Send, AlertCircle } from 'lucide-react';
import { CALL_TYPES, findCallType } from '@/lib/cadCallTypes';

export default function CreateCallDialog({ units, currentUser, onClose, onCreated, initialCallType, initialPriority, source, inline=false }) {
    const [creating, setCreating] = useState(false);
    const [selectedUnits, setSelectedUnits] = useState([]);
    const [suggestedCallType, setSuggestedCallType] = useState(null);
    const [callTypeSearch, setCallTypeSearch] = useState('');
    const filteredCallTypes = useMemo(() => {
        const query = callTypeSearch.trim().toLowerCase();
        if (!query) return CALL_TYPES;
        return CALL_TYPES.filter(type => [type.code, type.label, type.category, ...(type.keywords || [])].join(' ').toLowerCase().includes(query));
    }, [callTypeSearch]);
    const [formData, setFormData] = useState({
        incident: initialCallType || '',
        location: '',
        cross_street: '',
        landmark: '',
        description: '',
        priority: initialPriority || 'medium',
        agency: 'BPS',
        zone: '',
        caller_name: '',
        caller_phone: '',
        hazards: ''
    });

    const handleCreate = async () => {
        if (!formData.incident || !formData.location) {
            toast.error('Incident type and location are required');
            return;
        }

        setCreating(true);
        try {
            // Geocoding is helpful but must never prevent a CAD call from being
            // created. Abort the public geocoder quickly and let backend automation
            // fill coordinates later when the provider is slow/unavailable.
            let latitude = null, longitude = null;
            try {
                const controller = new AbortController();
                const timer = window.setTimeout(() => controller.abort(), 3500);
                const geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.location + ', Virginia, USA')}&limit=1`,
                    { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' }, signal: controller.signal }
                );
                window.clearTimeout(timer);
                const geoData = await geoResponse.json();
                if (geoData && geoData.length > 0) {
                    latitude = parseFloat(geoData[0].lat);
                    longitude = parseFloat(geoData[0].lon);
                }
            } catch (geocodeError) {
                console.warn('Create call geocoder skipped:', geocodeError?.message || geocodeError);
            }

            const cadResponse = await base44.functions.invoke('issueCadNumber', {});
            const cadPayload = cadResponse?.data || cadResponse || {};
            if (!cadPayload.cad_number) throw new Error(cadPayload.error || 'Unable to issue CAD number');
            const bpsReference = cadPayload.bps_reference || cadPayload.cad_number;

            const callData = {
                ...formData,
                ...(source==='field'?{source:'field_initiated',source_channel:'dispatcher_field_intake'}:{source:'dispatch_manual',source_channel:'dispatcher_manual_intake'}),
                call_id: bpsReference,
                bps_reference: bpsReference,
                agency_cad_number: '',
                cad_number_source: 'bps_internal',
                official_cad_verified: false,
                latitude,
                longitude,
                assigned_units: selectedUnits,
                status: selectedUnits.length > 0 ? 'Dispatched' : 'New',
                time_received: new Date().toISOString(),
                time_dispatched: selectedUnits.length > 0 ? new Date().toISOString() : null
            };

            const result = await base44.functions.invoke('createDispatchCall', { data: callData, selected_units: selectedUnits });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            if (!payload.success || !payload.call?.id) throw new Error('The CAD server did not confirm that the call was saved.');

            onCreated(payload.call);
            if (Array.isArray(payload.warnings) && payload.warnings.length) {
                toast.warning(`Call created. ${payload.warnings.join(' ')}`);
            }
        } catch (error) {
            console.error('Error creating call:', error);
            toast.error(error?.response?.data?.error || error?.message || 'Failed to create call');
        } finally {
            setCreating(false);
        }
    };

    const toggleUnit = (unitId) => {
        setSelectedUnits(prev =>
            prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
        );
    };

    if(inline) {
        const field=(key,label,required=false)=> <label className="cc-draft-field">{label}{required?' *':''}<input required={required} value={formData[key]} onChange={e=>setFormData(old=>({...old,[key]:e.target.value}))}/></label>;
        const eligible=units.filter(u=>u.id&&!u.connection_stale&&!u.dispatch_hold_new_calls&&(u.session_active===true||u.presence_online===true)&&u.session_active!==false&&!['offline','stale','out of service','distress'].includes(String(u.status||'').toLowerCase()));
        return <form className="cc-draft" onSubmit={e=>{e.preventDefault();if(!creating)void handleCreate();}}><header><b>{source==='field'?'FIELD-INITIATED INCIDENT':'NEW INCIDENT DRAFT'}</b><span>Not yet saved</span></header><div className="cc-draft-body">
         <div className="cc-draft-fields">{field('location','Address',true)}<div className="cc-draft-pair">{field('cross_street','Cross street')}{field('landmark','Additional location')}</div>{field('caller_phone','Callback number')}<label className="cc-draft-field">Incident description<textarea rows={4} value={formData.description} onChange={e=>setFormData(old=>({...old,description:e.target.value}))}/></label>{field('incident','Incident type',true)}<details><summary>Incident type catalog</summary><input value={callTypeSearch} onChange={e=>setCallTypeSearch(e.target.value)} placeholder="Find incident type" aria-label="Find incident type"/><div className="cc-draft-catalog">{filteredCallTypes.map(ct=><button type="button" key={ct.code} onClick={()=>setFormData(old=>({...old,incident:ct.label,priority:ct.priority||old.priority}))}>{ct.code} · {ct.label}</button>)}</div></details>{field('caller_name','Reporting party')}<div className="cc-draft-pair"><label className="cc-draft-field">Agency<select value={formData.agency} onChange={e=>setFormData(old=>({...old,agency:e.target.value}))}>{['BPS','RPD','HPD','CCPD'].map(a=><option key={a}>{a}</option>)}</select></label>{field('zone','Zone / beat')}</div><label className="cc-draft-field">Priority<select value={formData.priority} onChange={e=>setFormData(old=>({...old,priority:e.target.value}))}>{['low','medium','high','critical'].map(v=><option key={v}>{v}</option>)}</select></label><label className="cc-draft-field">Known hazards<textarea rows={2} value={formData.hazards} onChange={e=>setFormData(old=>({...old,hazards:e.target.value}))}/></label></div>
         <div className="cc-draft-units"><h3>Assign units ({selectedUnits.length})</h3>{eligible.map(u=><button type="button" key={u.id} aria-pressed={selectedUnits.includes(u.id)} onClick={()=>toggleUnit(u.id)}>{u.unit_number||'—'} · {u.rank} {u.last_name}<small>{u.status}</small></button>)}{!eligible.length&&<p>No eligible connected units.</p>}<p>Save without units to place the incident in Pending.</p></div></div><footer><button type="button" disabled={creating} onClick={()=>{if(window.confirm('Discard this incident draft?'))onClose();}}>Cancel</button><button type="submit" disabled={creating||!formData.location.trim()||!formData.incident.trim()}>{creating?'Saving…':selectedUnits.length?'Create & dispatch':'Create incident'}</button></footer></form>;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-5xl max-h-[90vh]"
            >
                <Card className="bg-slate-900 border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 flex-1 overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                                {source==='field'?'Record field-initiated incident':'Create New Call'}
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Left Column */}
                            <ScrollArea className="h-[500px] pr-4">
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-slate-300">Call Type *</Label>
                                        <Input
                                            value={formData.incident}
                                            onChange={(e) => {
                                                setFormData({...formData, incident: e.target.value});
                                                const match = findCallType(e.target.value);
                                                setSuggestedCallType(match);
                                            }}
                                            placeholder="Traffic Accident, Burglary, Medical Emergency..."
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                        {suggestedCallType && (
                                            <div className="mt-2 p-2 bg-blue-900/40 border border-blue-600/50 rounded text-blue-300 text-xs">
                                                <strong>Suggestion:</strong> {suggestedCallType.code} - {suggestedCallType.label}
                                                <Button
                                                    size="xs"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setFormData({...formData, incident: suggestedCallType.label});
                                                        setSuggestedCallType(null);
                                                    }}
                                                    className="ml-2 h-5 text-blue-300 hover:text-blue-100"
                                                >
                                                    Use
                                                </Button>
                                            </div>
                                        )}
                                        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/40 p-2">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">CAD Incident Catalog · {CALL_TYPES.length} Types</span>
                                                <span className="text-[9px] text-slate-600">Search or select</span>
                                            </div>
                                            <Input
                                                value={callTypeSearch}
                                                onChange={(e) => setCallTypeSearch(e.target.value)}
                                                placeholder="Search trespass, alarm, theft, medical, traffic..."
                                                className="mb-2 h-8 bg-slate-900 border-slate-700 text-xs text-white"
                                            />
                                            <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                                                {filteredCallTypes.map(ct => (
                                                    <button
                                                        type="button"
                                                        key={ct.code}
                                                        onClick={() => {
                                                            setFormData({...formData, incident: ct.label, priority: ct.priority || formData.priority});
                                                            setSuggestedCallType(null);
                                                        }}
                                                        className={`rounded border px-2.5 py-2 text-left text-xs transition-colors ${formData.incident === ct.label ? 'border-blue-500 bg-blue-950/50 text-white' : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-700/70 hover:text-white'}`}
                                                    >
                                                        <div className="flex items-center gap-2"><strong className="text-blue-300">{ct.code}</strong><span className="font-semibold">{ct.label}</span></div>
                                                        <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{ct.category || 'General'} · {(ct.priority || 'medium').toUpperCase()}</div>
                                                    </button>
                                                ))}
                                                {filteredCallTypes.length === 0 && <div className="col-span-full py-4 text-center text-xs text-slate-500">No matching CAD call type. You can still enter a custom incident above.</div>}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Location *</Label>
                                        <Input
                                            value={formData.location}
                                            onChange={(e) => setFormData({...formData, location: e.target.value})}
                                            placeholder="123 Main St, Richmond VA"
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Cross Street</Label>
                                            <Input
                                                value={formData.cross_street}
                                                onChange={(e) => setFormData({...formData, cross_street: e.target.value})}
                                                placeholder="Near..."
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Landmark</Label>
                                            <Input
                                                value={formData.landmark}
                                                onChange={(e) => setFormData({...formData, landmark: e.target.value})}
                                                placeholder="Building, park..."
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Description</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                                            placeholder="Detailed call information..."
                                            rows={4}
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Priority</Label>
                                            <select
                                                value={formData.priority}
                                                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                                                className="flex h-10 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-2 text-sm"
                                            >
                                                <option value="low">Low</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High</option>
                                                <option value="critical">Critical</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Agency</Label>
                                            <select
                                                value={formData.agency}
                                                onChange={(e) => setFormData({...formData, agency: e.target.value})}
                                                className="flex h-10 w-full rounded-md border bg-slate-800 border-slate-700 text-white px-3 py-2 text-sm"
                                            >
                                                <option value="BPS">BPS - Black Point Security</option>
                                                <option value="RPD">RPD - Richmond Police</option>
                                                <option value="HPD">HPD - Henrico Police</option>
                                                <option value="CCPD">CCPD - Chesterfield Police</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Zone/Beat</Label>
                                            <Input
                                                value={formData.zone}
                                                onChange={(e) => setFormData({...formData, zone: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Caller Name</Label>
                                            <Input
                                                value={formData.caller_name}
                                                onChange={(e) => setFormData({...formData, caller_name: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Caller Phone</Label>
                                            <Input
                                                value={formData.caller_phone}
                                                onChange={(e) => setFormData({...formData, caller_phone: e.target.value})}
                                                placeholder="Optional"
                                                className="bg-slate-800 border-slate-700 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Hazards / Warnings</Label>
                                        <Textarea
                                            value={formData.hazards}
                                            onChange={(e) => setFormData({...formData, hazards: e.target.value})}
                                            placeholder="Known hazards, weapons, aggressive animals..."
                                            rows={2}
                                            className="bg-slate-800 border-slate-700 text-white"
                                        />
                                    </div>
                                </div>
                            </ScrollArea>

                            {/* Right Column - Unit Selection */}
                            <div>
                                <Label className="text-slate-300 mb-3 block">
                                    Assign Units ({selectedUnits.length} selected)
                                </Label>
                                <ScrollArea className="h-[500px] border border-slate-700 rounded-lg p-3 bg-slate-800/50">
                                    {units.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-8">No units available</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {units
                                                .filter(unit => unit.status !== 'Out of Service' && unit.connection_stale !== true)
                                                .map(unit => (
                                                    <div
                                                        key={unit.id}
                                                        onClick={() => toggleUnit(unit.id)}
                                                        className={`p-3 rounded-lg cursor-pointer transition-all ${selectedUnits.includes(unit.id) ? 'bg-red-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold">{unit.unit_number || unit.label || 'Unit N/A'}</span>
                                                            <Badge variant="outline" className={selectedUnits.includes(unit.id) ? 'border-white text-white' : 'border-slate-600 text-slate-400'}>
                                                                {unit.status || 'Available'}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs opacity-80">
                                                            {unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name}
                                                        </p>
                                                        {selectedUnits.indexOf(unit.id) === 0 && (
                                                            <Badge className="mt-2 bg-yellow-600 text-white text-xs">Primary</Badge>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-slate-700">
                            <Button
                                variant="outline"
                                onClick={onClose}
                                className="border-slate-600 text-white"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={creating}
                                className="bg-red-600 hover:bg-red-700 px-8"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                {creating ? 'Creating...' : 'Create & Dispatch'}
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </motion.div>
    );
}