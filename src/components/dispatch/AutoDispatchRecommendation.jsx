import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CheckCircle2, ChevronDown, ChevronUp, FileWarning, Loader2, RefreshCw, ShieldAlert, UserX, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AutoDispatchRecommendation({ alert }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [oversightAction, setOversightAction] = useState('');
  const [oversightReason, setOversightReason] = useState('');
  const [oversightSaving, setOversightSaving] = useState(false);
  const [oversightMessage, setOversightMessage] = useState('');
  const evaluatedRef = useRef('');

  const evaluate = useCallback(async (manual = false) => {
    if (!alert?.callId || !alert?.id) return;
    const key = `${alert.id}:${alert.callId}`;
    if (!manual && evaluatedRef.current === key) return;
    evaluatedRef.current = key;
    setRunning(true);
    setError('');
    try {
      const response = await base44.functions.invoke('geofenceDispatchAssignment', {
        call_id: alert.callId,
        property_alert_id: alert.id,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      setResult(payload);
    } catch (err) {
      evaluatedRef.current = '';
      setError(err?.response?.data?.error || err?.message || 'Unable to evaluate eligible units');
    } finally {
      setRunning(false);
    }
  }, [alert?.callId, alert?.id]);

  useEffect(() => {
    evaluate(false);
  }, [evaluate]);

  // Do not retry-loop an evaluation when the backend is already throttled. The
  // active PropertyAlert subscription/poll will remount or the user can RECHECK.
  // This prevents a hidden shadow evaluator from creating another 429 storm.
  useEffect(() => undefined, [error, evaluate]);

  const runSafetyTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await base44.functions.invoke('testAutoDispatchShadow', {
        call_id: alert.callId,
        property_alert_id: alert.id,
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      setTestResult(payload);
      if (payload.evaluation) setResult(payload.evaluation);
    } catch (err) {
      setTestResult({ passed: false, error: err?.response?.data?.error || err?.message || 'Safety test failed' });
    } finally {
      setTesting(false);
    }
  };

  const submitOversight = async () => {
    if (oversightReason.trim().length < 5) {
      setOversightMessage('Enter a documented reason of at least 5 characters.');
      return;
    }
    setOversightSaving(true);
    setOversightMessage('');
    try {
      const response = await base44.functions.invoke('manageAutoDispatchOversight', {
        action: oversightAction,
        property_alert_id: alert.id,
        reason: oversightReason.trim(),
      });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      setOversightMessage('Saved to the permanent CAD audit history.');
      setTimeout(() => {
        setOversightAction('');
        setOversightReason('');
        setOversightMessage('');
        evaluate(true);
      }, 800);
    } catch (err) {
      setOversightMessage(err?.response?.data?.error || err?.message || 'Unable to save oversight action');
    } finally {
      setOversightSaving(false);
    }
  };

  if (running && !result) {
    return <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-950/30 px-3 py-2 text-[11px] text-blue-200"><Loader2 className="h-3.5 w-3.5 animate-spin" />Evaluating eligible units…</div>;
  }

  if (error && !result) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-950/20 p-2 text-[10px] text-cyan-100">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Automatic dispatch is reconnecting…
      </div>
    );
  }

  if (!result) return null;
  const recommendations = result.recommendations || [];
  const excluded = result.excluded_units || [];
  const disabled = result.decision === 'disabled';
  const manualReview = result.decision === 'manual_review';
  const partiallyAssigned = result.decision === 'partially_assigned';
  const config = result.configuration_snapshot || {};
  const configReason = config.configured_mode === 'disabled'
    ? 'Property automatic dispatch is turned OFF.'
    : config.configured_mode === 'shadow'
      ? 'Property is in SHADOW mode. Recommendations may be shown, but no unit is automatically assigned.'
      : config.configured_mode === 'manual_review'
        ? 'Property is configured for MANUAL REVIEW.'
        : config.configured_mode === 'live' && config.live_approved !== true
          ? 'Property is set to LIVE but does not have the required live-dispatch approval.'
          : ''; 
  const propertySettingsUrl = `${createPageUrl('AdminLocations')}?location_id=${encodeURIComponent(result.property?.id || alert?.propertyId || '')}`;

  return (
    <div className="mt-3 rounded-lg border border-cyan-500/30 bg-[#071827] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-cyan-300" />
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-100">Automatic Dispatch</span>
          <Badge className={`border text-[9px] ${partiallyAssigned ? 'border-amber-500/50 bg-amber-950 text-amber-200' : result.mode === 'live' ? 'border-emerald-500/50 bg-emerald-950 text-emerald-200' : 'border-cyan-500/40 bg-cyan-950 text-cyan-200'}`}>{result.mode === 'live' ? (result.decision === 'assigned' ? 'LIVE — FULLY ASSIGNED' : partiallyAssigned ? 'LIVE — BACKUP NEEDED' : 'LIVE') : 'SHADOW — NO STATUS CHANGE'}</Badge>
        </div>
        <Button size="sm" variant="ghost" disabled={running} onClick={() => evaluate(true)} className="h-7 text-[10px] text-cyan-200">
          {running ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}RECHECK
        </Button>
      </div>

      {(disabled || manualReview || configReason) && <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/25 p-3"><div className="text-xs font-black text-amber-200">{configReason || (disabled ? 'Automatic dispatch is disabled for this property.' : 'This property requires manual review.')}</div><div className="mt-2 grid gap-2 text-[10px] text-slate-300 sm:grid-cols-4"><div><span className="text-slate-500">PROPERTY</span><div className="font-bold text-white">{result.property?.name || alert?.propertyName || 'Monitored property'}</div></div><div><span className="text-slate-500">SAVED MODE</span><div className="font-bold text-white">{String(config.configured_mode || result.mode || 'unknown').replaceAll('_',' ').toUpperCase()}</div></div><div><span className="text-slate-500">LIVE APPROVED</span><div className="font-bold text-white">{config.live_approved ? 'YES' : 'NO'}</div></div><div><span className="text-slate-500">REQUIRED UNITS</span><div className="font-bold text-white">{config.required_units ?? '—'}</div></div></div><Link to={propertySettingsUrl} className="mt-3 inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[10px] font-black text-amber-100 hover:bg-amber-500/20"><Settings className="mr-1.5 h-3.5 w-3.5"/>OPEN PROPERTY AUTO-DISPATCH SETTINGS</Link></div>}

      {disabled ? (
        <div className="mt-2 text-xs font-semibold text-slate-400">Manual dispatch remains available until this property's automatic-dispatch setting is enabled.</div>
      ) : manualReview ? (
        <div className="mt-2 text-xs font-semibold text-amber-300">No automatic assignment will occur until the property configuration above is changed to an approved Live mode.</div>
      ) : recommendations.length ? (
        <div className="mt-2 space-y-2">
          {recommendations.map((unit, index) => (
            <div key={unit.unit_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  {index === 0 ? 'PRIMARY RECOMMENDATION' : 'BACKUP RECOMMENDATION'} — UNIT {unit.unit_number || 'UNASSIGNED'}
                </div>
                <div className="mt-1 text-[10px] text-slate-300">{unit.officer_name || unit.officer_email}</div>
              </div>
              <div className="text-right text-[10px] text-emerald-200">{unit.distance_miles} mi · ETA {unit.eta_minutes} min</div>
            </div>
          ))}
          {partiallyAssigned && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs font-black text-amber-200">
              <FileWarning className="h-4 w-4" />{result.staffing_shortfall || 1} ADDITIONAL QUALIFIED UNIT{Number(result.staffing_shortfall || 1) === 1 ? '' : 'S'} REQUIRED
            </div>
          )}
          <p className="text-[10px] text-slate-400">Selection requires clock-in, an active signed-in session, Available status, reliable current GPS, property authorization, qualifications, and no conflicting active assignment.</p>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs font-black text-red-200">
          <UserX className="h-4 w-4" />NO ELIGIBLE UNIT AVAILABLE — MANUAL ASSIGNMENT REQUIRED
        </div>
      )}

      <button type="button" onClick={() => setShowExcluded(value => !value)} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white">
        {showExcluded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {excluded.length} EXCLUDED UNIT{excluded.length === 1 ? '' : 'S'} — SHOW REASONS
      </button>
      {showExcluded && (
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
          {excluded.length === 0 ? <div className="text-[10px] text-slate-500">No excluded field units.</div> : excluded.map(unit => (
            <div key={unit.unit_id} className="rounded-md border border-slate-700 bg-slate-950/60 p-2">
              <div className="text-[10px] font-bold text-slate-200">UNIT {unit.unit_number || 'UNASSIGNED'} — {unit.officer_name || unit.officer_email}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-slate-400">
                {(unit.reasons || []).map(reason => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-700 pt-3">
        <Button size="sm" variant="outline" onClick={() => setOversightAction('document_override')} className="h-7 border-amber-500/40 text-[10px] text-amber-100">
          <FileWarning className="mr-1 h-3 w-3" />DOCUMENT OVERRIDE
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOversightAction('resolve_false_alarm')} className="h-7 border-red-500/40 text-[10px] text-red-100">
          RESOLVE FALSE ALARM
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOversightAction('mark_test')} className="h-7 border-slate-500/40 text-[10px] text-slate-100">
          MARK AS TEST
        </Button>
        <Button size="sm" variant="outline" disabled={testing || running} onClick={runSafetyTest} className="h-7 border-cyan-500/40 text-[10px] text-cyan-100">
          {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldAlert className="mr-1 h-3 w-3" />}
          RUN SHADOW SAFETY TEST
        </Button>
        {testResult && (
          <div className={`mt-2 rounded-md border px-3 py-2 text-[10px] ${testResult.passed ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200' : 'border-red-500/40 bg-red-950/20 text-red-200'}`}>
            <div className="font-black">{testResult.passed ? 'PASSED — SIMULATION MADE NO OPERATIONAL CHANGES' : 'FAILED — AUTOMATIC DISPATCH SAFETY CHECK'}</div>
            {testResult.error && <div className="mt-1">{testResult.error}</div>}
            {testResult.checks && <div className="mt-1">{Object.entries(testResult.checks).map(([name, passed]) => `${passed ? '✓' : '✕'} ${name.replaceAll('_', ' ')}`).join(' · ')}</div>}
          </div>
        )}
      </div>

      <Dialog open={Boolean(oversightAction)} onOpenChange={(open) => { if (!open && !oversightSaving) { setOversightAction(''); setOversightReason(''); setOversightMessage(''); } }}>
        <DialogContent className="border-slate-700 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>{oversightAction === 'document_override' ? 'Document Dispatch Override' : oversightAction === 'resolve_false_alarm' ? 'Resolve False Alarm' : 'Mark Property Alert as Test'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-300">This action is recorded with your identity, timestamp, CAD call, and reason.</p>
          <Input value={oversightReason} onChange={(event) => setOversightReason(event.target.value)} placeholder="Required documented reason" disabled={oversightSaving} />
          {oversightMessage && <div className="rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200">{oversightMessage}</div>}
          <DialogFooter>
            <Button variant="outline" disabled={oversightSaving} onClick={() => setOversightAction('')}>Cancel</Button>
            <Button disabled={oversightSaving || oversightReason.trim().length < 5} onClick={submitOversight}>
              {oversightSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
