import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { cadAgeLabel, cadTelemetry } from '@/lib/cadOperationalStatus';

/**
 * CommandCentral-style persistent status bar: feed health and live telemetry
 * stay on screen across every CAD workstation, so a dispatcher never has to
 * leave the current screen to see unassigned, overdue or distress counts.
 */
export default function CadStatusBar({
  calls = [],
  units = [],
  loading = false,
  rateLimited = false,
  onRefresh,
  onSearch,
  onOpenWorkstation,
  activeWorkstation,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const telemetry = useMemo(() => cadTelemetry(calls, units, now), [calls, units, now]);
  const feed = rateLimited ? 'limited' : loading ? 'syncing' : 'live';

  const items = [
    { id: 'all', label: 'Active', value: telemetry.active, tone: 'neutral', station: 'command' },
    { id: 'unassigned', label: 'Unassigned', value: telemetry.unassigned, tone: telemetry.unassigned ? 'warning' : 'neutral', station: 'command' },
    { id: 'urgent', label: 'P1 / P2', value: telemetry.urgent, tone: telemetry.urgent ? 'danger' : 'neutral', station: 'command' },
    { id: 'overdue', label: 'Overdue', value: telemetry.overdue, tone: telemetry.overdue ? 'danger' : 'ready', station: 'command' },
    { id: 'onDuty', label: 'On duty', value: telemetry.onDuty, tone: 'neutral', station: 'statusboard' },
    { id: 'available', label: 'Available', value: telemetry.available, tone: 'ready', station: 'statusboard' },
    { id: 'distress', label: 'Distress', value: telemetry.distress, tone: telemetry.distress ? 'danger' : 'neutral', station: 'statusboard' },
  ];

  return (
    <div className="cad-ops-strip">
      <span className="cad-ops-feed" data-state={feed}>
        <i aria-hidden="true" />
        {feed === 'live' ? 'CAD feed live' : feed === 'syncing' ? 'Syncing CAD' : 'Feed rate limited'}
      </span>
      <div className="cad-ops-metrics">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            data-tone={item.tone}
            onClick={() => onOpenWorkstation?.(item.station, item.id)}
            title={`Open ${item.station === 'statusboard' ? 'unit board' : 'command board'}`}
          >
            <span>{item.label}</span>
            <strong>{loading && !calls.length && item.id === 'all' ? '—' : item.value}</strong>
          </button>
        ))}
      </div>
      <span className="cad-ops-oldest" data-tone={telemetry.overdue ? 'danger' : 'neutral'}>
        <b>Oldest hold</b>
        <span>{telemetry.active ? cadAgeLabel(telemetry.oldestMinutes) : '—'}</span>
      </span>
      <button type="button" className="cad-ops-search" onClick={onSearch} aria-label="Search incidents and units">
        <Search size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button type="button" className="cad-ops-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh CAD data">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}