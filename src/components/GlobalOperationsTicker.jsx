import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileWarning, Siren } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

const CLOSED_CALL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);
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

const normalized = value => String(value || '').trim().toLowerCase();
const displayText = value => String(value || '').trim().replace(/\s+/g, ' ');

function recordTime(record) {
  const value = record?.updated_date || record?.created_date || record?.time_received || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function upsert(rows, record) {
  if (!record?.id) return rows;
  const next = rows.filter(item => String(item.id) !== String(record.id));
  next.push(record);
  return next.sort((a, b) => recordTime(b) - recordTime(a));
}

function boloGroupSegments(bolos = []) {
  const groups = new Map();
  for (const bolo of bolos) {
    if (normalized(bolo?.status) !== 'active') continue;
    const priority = normalized(bolo.priority) || 'medium';
    const family = boloFamily(bolo);
    // Matching priority + semantic family is similar criteria. This intentionally
    // merges legacy WATCH NOTICE records titled "Fugitive File" with newer
    // WANTED PERSON records while leaving every underlying BOLO file separate.
    const key = `${priority}|${family}`;
    const group = groups.get(key) || { priority, family, items: [] };
    group.items.push(bolo);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => {
      const weight = { critical: 4, high: 3, medium: 2, low: 1 };
      return (weight[b.priority] || 0) - (weight[a.priority] || 0)
        || recordTime(b.items[0]) - recordTime(a.items[0]);
    })
    .map(group => {
      const count = group.items.length;
      const [singular, plural] = BOLO_LABELS[group.family] || ['BOLO FILE', 'BOLO FILES'];
      const locations = [...new Set(group.items.map(item => displayText(item.last_known_location)).filter(Boolean).map(value => value.toUpperCase()))];
      const single = group.items[0];
      const detail = count === 1
        ? [single.title || single.subject_name || single.vehicle_plate || single.bolo_number, locations[0]].filter(Boolean).join(' · ')
        : locations.length === 1
          ? locations[0]
          : locations.length > 1
            ? 'MULTIPLE LOCATIONS'
            : '';
      return {
        key: `bolo:${group.priority}:${group.family}`,
        kind: 'bolo',
        text: `${count} ${PRIORITY_SHORT[group.priority] || group.priority.toUpperCase()} · ${count === 1 ? singular : plural}${detail ? ` · ${detail}` : ''}`,
        href: createPageUrl('BOLOAlerts'),
      };
    });
}

export default function GlobalOperationsTicker({ user, currentPageName }) {
  const [criticalCalls, setCriticalCalls] = useState([]);
  const [activeBolos, setActiveBolos] = useState([]);
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
        const [calls, bolos] = await Promise.all([
          base44.entities.DispatchCall.filter({ priority: 'critical' }, '-time_received', 100),
          base44.entities.BOLOAlert.filter({ status: 'active' }, '-updated_date', 100),
        ]);
        if (!mounted) return;
        setCriticalCalls((calls || []).filter(call => !CLOSED_CALL_STATUSES.has(normalized(call.status))));
        setActiveBolos((bolos || []).filter(bolo => normalized(bolo.status) === 'active'));
        backoffUntilRef.current = 0;
      } catch (error) {
        const message = String(error?.message || error || '');
        backoffUntilRef.current = Date.now() + (/rate limit|too many requests|\b429\b/i.test(message) ? 90_000 : 20_000);
      } finally {
        loadingRef.current = false;
      }
    };

    const applyCallEvent = event => {
      const record = event?.data;
      if (!record?.id) return;
      setCriticalCalls(current => {
        const without = current.filter(item => String(item.id) !== String(record.id));
        if (event.type === 'delete' || normalized(record.priority) !== 'critical' || CLOSED_CALL_STATUSES.has(normalized(record.status))) return without;
        return upsert(without, record).slice(0, 100);
      });
    };

    const applyBoloEvent = event => {
      const record = event?.data;
      if (!record?.id) return;
      setActiveBolos(current => {
        const without = current.filter(item => String(item.id) !== String(record.id));
        if (event.type === 'delete' || normalized(record.status) !== 'active') return without;
        return upsert(without, record).slice(0, 100);
      });
    };

    load(true);
    let callUnsubscribe;
    let boloUnsubscribe;
    try { callUnsubscribe = base44.entities.DispatchCall.subscribe(applyCallEvent); } catch {}
    try { boloUnsubscribe = base44.entities.BOLOAlert.subscribe(applyBoloEvent); } catch {}

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
      if (typeof callUnsubscribe === 'function') callUnsubscribe();
      if (typeof boloUnsubscribe === 'function') boloUnsubscribe();
    };
  }, [internal]);

  const segments = useMemo(() => {
    const calls = [...criticalCalls]
      .sort((a, b) => recordTime(b) - recordTime(a))
      .map(call => ({
        key: `call:${call.id}`,
        kind: 'call',
        text: `CRITICAL CALL · ${call.agency_cad_number || call.bps_reference || call.call_id || 'CAD'} · ${displayText(call.incident || 'CALL FOR SERVICE').toUpperCase()} · ${displayText(call.location || 'LOCATION PENDING').toUpperCase()}`,
        href: createPageUrl('DispatchCenter'),
      }));
    return [...calls, ...boloGroupSegments(activeBolos)];
  }, [criticalCalls, activeBolos]);

  const cadLivePage = ['CADCenter', 'CommandDashboard', 'DispatchCenter', 'OfficerDispatchQueue', 'Navigation'].includes(String(currentPageName || ''));
  if (!internal || cadLivePage || segments.length === 0) return null;

  const strip = duplicateIndex => (
    <div key={duplicateIndex} className="flex shrink-0 items-center">
      {segments.map(segment => (
        <button
          key={`${duplicateIndex}:${segment.key}`}
          type="button"
          onClick={() => { window.location.href = segment.href; }}
          className="group flex shrink-0 items-center gap-2 px-5 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.11em] text-white hover:bg-white/10"
        >
          {segment.kind === 'call'
            ? <Siren className="h-3.5 w-3.5 animate-pulse text-red-300" />
            : <FileWarning className="h-3.5 w-3.5 text-amber-300" />}
          <span>{segment.text}</span>
          <span className="ml-3 text-red-400/80">◆</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="bps-operations-ticker flex h-8 shrink-0 items-center overflow-hidden border-b border-red-700/60 bg-[#24080b] shadow-[0_4px_16px_rgba(0,0,0,.25)]" role="status" aria-label="Critical calls and active BOLO alerts">
      <div className="z-10 flex h-full shrink-0 items-center gap-1 border-r border-red-700/70 bg-red-950 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-red-200">
        <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
        Live Alerts
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="bps-operations-ticker-track flex min-w-max items-center whitespace-nowrap">
          {strip(0)}
          {strip(1)}
        </div>
      </div>
    </div>
  );
}
