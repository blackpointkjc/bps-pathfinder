import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, ShieldAlert, UserX } from 'lucide-react';

export default function AutoDispatchRecommendation({ alert }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
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

  if (running && !result) {
    return <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-950/30 px-3 py-2 text-[11px] text-blue-200"><Loader2 className="h-3.5 w-3.5 animate-spin" />Evaluating eligible units…</div>;
  }

  if (error) {
    return (
      <div className="mt-3 rounded-md border border-red-500/40 bg-red-950/30 p-3 text-[11px] text-red-200">
        <div className="font-bold">Automatic-dispatch preview failed</div>
        <div className="mt-1">{error}</div>
        <Button size="sm" variant="outline" onClick={() => evaluate(true)} className="mt-2 h-7 border-red-500/40 text-[10px]">TRY AGAIN</Button>
      </div>
    );
  }

  if (!result) return null;
  const recommendations = result.recommendations || [];
  const excluded = result.excluded_units || [];
  const disabled = result.decision === 'disabled';
  const manualReview = result.decision === 'manual_review';

  return (
    <div className="mt-3 rounded-lg border border-cyan-500/30 bg-[#071827] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-cyan-300" />
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-100">Automatic Dispatch</span>
          <Badge className={`border text-[9px] ${result.mode === 'live' ? 'border-emerald-500/50 bg-emerald-950 text-emerald-200' : 'border-cyan-500/40 bg-cyan-950 text-cyan-200'}`}>{result.mode === 'live' ? (result.decision === 'assigned' ? 'LIVE — ASSIGNED' : 'LIVE') : 'SHADOW — NO STATUS CHANGE'}</Badge>
        </div>
        <Button size="sm" variant="ghost" disabled={running} onClick={() => evaluate(true)} className="h-7 text-[10px] text-cyan-200">
          {running ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}RECHECK
        </Button>
      </div>

      {disabled ? (
        <div className="mt-2 text-xs font-semibold text-slate-400">Automatic dispatch is disabled for this property. Manual dispatch remains available.</div>
      ) : manualReview ? (
        <div className="mt-2 text-xs font-semibold text-amber-300">This property requires manual review. Recommendations are recorded without assigning a unit.</div>
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

      <div className="mt-3 border-t border-slate-700 pt-3">
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
    </div>
  );
}
