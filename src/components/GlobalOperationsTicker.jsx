import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileWarning, MapPin, Siren } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { cleanIncident } from '@/utils/callUtils';
import { classifyCall } from '@/lib/cadCallTypes';
import { dedupeOperationalCalls, loadActiveDispatchCallRows } from '@/lib/activeDispatchCalls';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';

const CLOSED = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
const PRIORITY_SHORT = { critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW' };
const BOLO_LABELS = {
  fugitive: ['FUGITIVE FILE', 'FUGITIVE FILES'],
  missing_person: ['MISSING PERSON FILE', 'MISSING PERSON FILES'],
  stolen_vehicle: ['STOLEN VEHICLE FILE', 'STOLEN VEHICLE FILES'],
  officer_safety: ['OFFICER SAFETY FILE', 'OFFICER SAFETY FILES'],
  special_instruction: ['SPECIAL INSTRUCTION', 'SPECIAL INSTRUCTIONS'],
  property_alert: ['PROPERTY ALERT', 'PROPERTY ALERTS'],
  watch_notice: ['WATCH FILE', 'WATCH FILES'],
};

const normalized = value => String(value || '').trim().toLowerCase();
const displayText = value => String(value || '').trim().replace(/\s+/g, ' ');

function recordTime(record) {
  const value = record?.updated_date || record?.created_date || record?.time_received || record?.activated_at || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function upsert(rows, record) {
  if (!record?.id) return rows || [];
  const next = (rows || []).filter(item => String(item.id) !== String(record.id));
  next.push(record);
  return next.sort((a, b) => recordTime(b) - recordTime(a));
}

function callPriority(call) {
  if (call?.priority_override && call?.priority) return normalized(call.priority);
  const classification = classifyCall(`${call?.incident || ''} ${call?.description || ''}`);
  return normalized(classification.matched_type?.priority || call?.priority || 'medium');
}

function criticalSummary(calls) {
  const critical = dedupeOperationalCalls(calls)
    .filter(call => !CLOSED.has(normalized(call.status)) && callPriority(call) === 'critical')
    .slice(0, 3);
  if (!critical.length) return null;

  const detailParts = [];
  for (const call of critical.slice(0, 2)) {
    const incident = displayText(cleanIncident(call)).toUpperCase();
    const investigate = incident.match(/^(.*?)\s*,\s*INVESTIGATE$/i);
    if (investigate?.[1]) {
      detailParts.push(investigate[1].trim());
      detailParts.push(`INVESTIGATE @ ${displayText(call.location).toUpperCase()}`);
    } else {
      detailParts.push(`${incident} @ ${displayText(call.location).toUpperCase()}`);
    }
  }

  return {
    key: 'critical:summary',
    kind: 'call',
    href: createPageUrl('DispatchCenter'),
    text: `⚠ ${critical.length} CRITICAL INCIDENT${critical.length === 1 ? '' : 'S'} ACTIVE · ${detailParts.join(' | ')}`,
  };
}

function boloFamily(bolo = {}) {
  const type = normalized(bolo.alert_type) || 'watch_notice';
  const words = normalized(`${bolo.title || ''} ${bolo.description || ''}`);
  if (type === 'wanted_person' || /\bfugitive\b|\bwanted\b/.test(words)) return 'fugitive';
  if (type === 'missing_person' || /\bmissing person\b/.test(words)) return 'missing_person';
  if (type === 'stolen_vehicle' || /\bstolen vehicle\b/.test(words)) return 'stolen_vehicle';
  if (type === 'officer_safety') return 'officer_safety';
  if (type === 'special_instruction') return 'special_instruction';
  if (type === 'property_alert') return 'property_alert';
  return 'watch_notice';
}

function boloSegments(bolos = []) {
  const groups = new Map();
  for (const bolo of bolos) {
    if (normalized(bolo?.status) !== 'active') continue;
    const priority = normalized(bolo.priority) || 'medium';
    const family = boloFamily(bolo);
    const key = `${priority}|${family}`;
    const group = groups.get(key) || { priority, family, items: [] };
    group.items.push(bolo);
    groups.set(key, group);
  }

  return [...groups.values()].map(group => {
    const count = group.items.length;
    const [singular, plural] = BOLO_LABELS[group.family] || ['BOLO FILE', 'BOLO FILES'];
    const locations = [...new Set(group.items.map(item => displayText(item.last_known_location)).filter(Boolean).map(value => value.toUpperCase()))];
    const single = group.items[0];
    const detail = count === 1
      ? [single.title || single.subject_name || single.vehicle_plate || single.bolo_number, locations[0]].filter(Boolean).join(' · ')
      : locations.length === 1 ? locations[0] : locations.length > 1 ? 'MULTIPLE LOCATIONS' : '';
    return {
      key: `bolo:${group.priority}:${group.family}`,
      kind: 'bolo',
      href: createPageUrl('BOLOAlerts'),
      text: `${count} ${PRIORITY_SHORT[group.priority] || group.priority.toUpperCase()} · ${count === 1 ? singular : plural}${detail ? ` · ${detail}` : ''}`,
    };
  });
}

function distressSegments(rows = []) {
  return (rows || [])
    .filter(row => ['active', 'acknowledged', 'responders_enroute'].includes(normalized(row.status)))
    .map(row => ({
      key: `distress:${row.id}`,
      kind: 'distress',
      href: createPageUrl('DispatchCenter'),
      text: `OFFICER DISTRESS · UNIT ${row.unit_number || 'UNKNOWN'} · ${displayText([row.rank, row.last_name || row.officer_name].filter(Boolean).join(' ')).toUpperCase()}`,
    }));
}

function propertySegments(rows = [], calls = []) {
  const activeCalls = dedupeOperationalCalls(calls).filter(call => !CLOSED.has(normalized(call.status)));
  const activeById = new Map();
  for (const call of activeCalls) {
    [call.id, call.external_call_id, call.agency_cad_number, call.bps_reference, call.call_id]
      .filter(Boolean)
      .forEach(value => activeById.set(String(value), call));
  }
  const criticalCallIds = new Set(
    activeCalls
      .filter(call => callPriority(call) === 'critical')
      .flatMap(call => [call.id, call.external_call_id, call.agency_cad_number, call.bps_reference, call.call_id])
      .filter(Boolean)
      .map(String)
  );
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    if (row?.is_test === true || ['resolved', 'false_alarm', 'test'].includes(normalized(row.lifecycle_status))) continue;
    const linkedKeys = [row.callId, row.source_key, row.agency_cad_number, row.bps_reference].filter(Boolean).map(String);
    const liveCall = linkedKeys.map(value => activeById.get(value)).find(Boolean);
    if (!liveCall) continue;
    if (linkedKeys.some(value => criticalCallIds.has(value))) continue;
    const stableCallKey = String(liveCall.external_call_id || liveCall.agency_cad_number || liveCall.bps_reference || liveCall.call_id || liveCall.id);
    const key = `${row.propertyId || row.propertyName || 'property'}|${stableCallKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      key: `property:${key}`,
      kind: 'property',
      href: createPageUrl('DispatchCenter'),
      text: `PROPERTY ALERT · ${displayText(liveCall.incident || row.callIncident || 'ACTIVE CALL').toUpperCase()} @ ${displayText(liveCall.location || row.callLocation || row.propertyName || 'MONITORED PROPERTY').toUpperCase()}`,
    });
  }
  return result.slice(0, 4);
}

export default function GlobalOperationsTicker({ user, currentPageName }) {
  const [calls, setCalls] = useState([]);
  const [activeBolos, setActiveBolos] = useState([]);
  const [distress, setDistress] = useState([]);
  const [propertyAlerts, setPropertyAlerts] = useState([]);
  const loadingRef = useRef(false);
  const backoffUntilRef = useRef(0);

  const roles = useMemo(
    () => new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(normalized)),
    [user?.role, user?.additional_roles],
  );
  const internal = Boolean(user?.id) && !roles.has('client') && !roles.has('student') && user?.user_type !== 'client';

  useEffect(() => {
    if (!internal) return undefined;
    let mounted = true;

    const load = async (force = false) => {
      if (loadingRef.current) return;
      if (!force && Date.now() < backoffUntilRef.current) return;
      loadingRef.current = true;
      try {
        const [callRows, bolos, distressRows, propertyRows] = await Promise.all([
          loadActiveDispatchCallRows(200),
          base44.entities.BOLOAlert.filter({ status: 'active' }, '-updated_date', 100),
          base44.entities.OfficerDistress.list('-activated_at', 20),
          base44.entities.PropertyAlert.list('-created_date', 50),
        ]);
        if (!mounted) return;
        setCalls(dedupeOperationalCalls(callRows || []));
        setActiveBolos((bolos || []).filter(row => normalized(row.status) === 'active'));
        setDistress(distressRows || []);
        setPropertyAlerts(propertyRows || []);
        backoffUntilRef.current = 0;
      } catch (error) {
        const message = String(error?.message || error || '');
        backoffUntilRef.current = Date.now() + (/rate limit|too many requests|\b429\b/i.test(message) ? 90_000 : 20_000);
      } finally {
        loadingRef.current = false;
      }
    };

    load(true);
    const callUnsubscribe = subscribeDispatchCallChanges(event => {
      setCalls(current => applyDispatchCallEvent(current, event, { hideClosed: true, maxAgeMs: 65 * 60 * 1000, limit: 200 }));
    });
    const unsubscribers = [callUnsubscribe];
    try {
      const unsub = base44.entities.BOLOAlert.subscribe(event => {
        const row = event?.data;
        if (!row?.id) return;
        setActiveBolos(current => event.type === 'delete' || normalized(row.status) !== 'active'
          ? current.filter(item => String(item.id) !== String(row.id))
          : upsert(current, row));
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    } catch {}
    try {
      const unsub = base44.entities.OfficerDistress.subscribe(event => {
        const row = event?.data;
        if (!row?.id) return;
        setDistress(current => event.type === 'delete'
          ? current.filter(item => String(item.id) !== String(row.id))
          : upsert(current, row));
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    } catch {}
    try {
      const unsub = base44.entities.PropertyAlert.subscribe(event => {
        const row = event?.data;
        if (!row?.id) return;
        setPropertyAlerts(current => event.type === 'delete'
          ? current.filter(item => String(item.id) !== String(row.id))
          : upsert(current, row));
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    } catch {}

    const refresh = () => load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 2 * 60 * 1000);
    window.addEventListener('bps-operational-resume', refresh);
    window.addEventListener('online', refresh);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener('bps-operational-resume', refresh);
      window.removeEventListener('online', refresh);
      unsubscribers.forEach(unsubscribe => { try { unsubscribe?.(); } catch {} });
    };
  }, [internal]);

  const segments = useMemo(() => {
    const critical = criticalSummary(calls);
    return [
      ...distressSegments(distress),
      ...(critical ? [critical] : []),
      ...propertySegments(propertyAlerts, calls),
      ...boloSegments(activeBolos),
    ];
  }, [calls, distress, propertyAlerts, activeBolos]);

  if (!internal || segments.length === 0) return null;

  return (
    <div className="bps-operations-ticker flex h-9 shrink-0 items-center overflow-hidden border-b border-red-700/60 bg-[#24080b] shadow-[0_6px_18px_rgba(0,0,0,.28)]" role="status" aria-label="Live operational alerts">
      <div className="z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-red-700/70 bg-red-950 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-red-100">
        <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
        Live Alerts
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="bps-operations-ticker-track flex w-max items-center whitespace-nowrap">
          {segments.map(segment => (
            <button
              key={segment.key}
              type="button"
              onClick={() => { window.location.href = segment.href; }}
              className="group flex shrink-0 items-center gap-2 px-5 py-2 text-left text-[10px] font-black uppercase tracking-[0.11em] text-white hover:bg-white/10"
            >
              {segment.kind === 'bolo'
                ? <FileWarning className="h-3.5 w-3.5 text-amber-300" />
                : segment.kind === 'property'
                  ? <MapPin className="h-3.5 w-3.5 text-orange-300" />
                  : <Siren className="h-3.5 w-3.5 animate-pulse text-red-300" />}
              <span>{segment.text}</span>
              <span className="ml-3 text-red-400/80">◆</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
