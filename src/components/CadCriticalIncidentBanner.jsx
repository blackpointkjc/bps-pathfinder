import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { classifyCall } from '@/lib/cadCallTypes';
import { cleanIncident } from '@/utils/callUtils';
import { dedupeOperationalCalls, loadActiveDispatchCallRows } from '@/lib/activeDispatchCalls';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';

const HIDDEN = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);

function priorityOf(call) {
  if (call?.priority_override && call?.priority) return call.priority;
  const classification = classifyCall(`${call?.incident || ''} ${call?.description || ''}`);
  return classification.matched_type?.priority || call?.priority || 'medium';
}

function bannerLines(calls) {
  const primary = [];
  const secondary = [];
  for (const call of calls.slice(0, 2)) {
    const incident = String(cleanIncident(call) || '').replace(/\s+/g, ' ').trim();
    const split = incident.match(/^(.*?)\s*,\s*INVESTIGATE$/i);
    if (split?.[1]) {
      primary.push(split[1].trim());
      secondary.push(`INVESTIGATE @ ${call.location}`);
    } else {
      primary.push(`${incident} @ ${call.location}`);
    }
  }
  return [primary.join(' | '), ...secondary].filter(Boolean);
}

export default function CadCriticalIncidentBanner() {
  const [calls, setCalls] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const rows = await loadActiveDispatchCallRows(200);
        if (mounted) setCalls(dedupeOperationalCalls(rows));
      } catch {
        // Preserve the last confirmed banner state on a transient feed failure.
      }
    };
    load();
    const unsubscribe = subscribeDispatchCallChanges(event => {
      setCalls(current => applyDispatchCallEvent(current, event, { hideClosed: true, maxAgeMs: 60 * 60 * 1000, limit: 200 }));
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 15_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, []);

  const criticalCalls = useMemo(
    () => dedupeOperationalCalls(calls).filter(call => !HIDDEN.has(String(call?.status || '').trim().toLowerCase()) && priorityOf(call) === 'critical'),
    [calls],
  );
  const lines = useMemo(() => bannerLines(criticalCalls), [criticalCalls]);

  if (!criticalCalls.length) return null;

  return (
    <div className="cad-critical-live-banner shrink-0 border-b border-red-500/80 bg-gradient-to-r from-[#641116] via-[#861c23] to-[#4d0d12] px-4 py-2.5 shadow-[0_10px_30px_rgba(127,29,29,.22)]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-red-200" />
        <div className="min-w-0 font-mono uppercase">
          <div className="text-xs font-black tracking-[0.08em] text-white">
            ⚠ {criticalCalls.length} CRITICAL INCIDENT{criticalCalls.length > 1 ? 'S' : ''} ACTIVE
          </div>
          {lines.map((line, index) => (
            <div key={index} className="mt-0.5 text-[11px] font-bold tracking-[0.04em] text-red-100/90">{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
