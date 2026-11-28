import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { cadAgeLabel, cadTelemetry } from '@/lib/cadOperationalStatus';
import { formatEasternTime } from '@/lib/easternTime';
import './cad-command.css';

const FEED = {
  live: { label: 'CAD feed live', tone: 'ready' },
  syncing: { label: 'Syncing', tone: 'loading' },
  limited: { label: 'Rate limited', tone: 'warning' },
};

/**
 * CommandCentral-style persistent status bar. Feed health, service levels and
 * resource counts stay on screen across every CAD workstation, so a dispatcher
 * never has to leave the current screen to see unassigned, overdue or distress
 * workload.
 */
export default function CadStatusBar({
  calls = [],
  units = [],
  loading = false,
  rateLimited = false,
  lastRefresh = null,
  onRefresh,
  onFind,
  onOpen,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const telemetry = useMemo(() => cadTelemetry(calls, units, now), [calls, units, now]);
  const feed = rateLimited ? FEED.limited : loading && !calls.length ? FEED.syncing : FEED.live;

  const metrics = [
    { key: 'active', label: 'Active', value: telemetry.active, tone: 'normal', target: { tool: 'command', params: { cad_focus: 'all' } } },
    { key: 'unassigned', label: 'Unassigned', value: telemetry.unassigned, tone: 'warning', target: { tool: 'command', params: { cad_focus: 'unassigned' } } },
    { key: 'urgent', label: 'P1 / P2', value: telemetry.urgent, tone: 'danger', target: { tool: 'command', params: { cad_focus: 'urgent' } } },
    { key: 'overdue', label: 'Over SLA', value: telemetry.overdue, tone: telemetry.overdue ? 'danger' : 'normal', target: { tool: 'resources' } },
    { key: 'available', label: 'Available', value: telemetry.available, tone: 'ready', target: { tool: 'resources', params: { cad_status: 'Available' } } },
    { key: 'distress', label: 'Distress', value: telemetry.distress, tone: telemetry.distress ? 'danger' : 'normal', target: { tool: 'resources', params: { cad_status: 'Distress' } } },
  ];

  return (
    <div className="cad-command-statusbar" role="status" aria-live="polite">
      <span className="cad-status-feed" data-tone={feed.tone}><i />{feed.label}</span>
      <div className="cad-status-metrics">
        {metrics.map(metric => (
          <button key={metric.key} type="button" data-tone={metric.tone} onClick={() => onOpen?.(metric.target)}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </button>
        ))}
      </div>
      <div className="cad-status-actions">
        {telemetry.oldest > 0 && <span className="cad-status-oldest">Oldest {cadAgeLabel(telemetry.oldest)}</span>}
        <span className="cad-status-sync">{lastRefresh ? `Synced ${formatEasternTime(lastRefresh)} ET` : 'Awaiting sync'}</span>
        <button type="button" onClick={onFind} aria-label="Open the CAD command palette">
          <Search size={14} /><span>Find</span><kbd>Ctrl K</kbd>
        </button>
        <button type="button" onClick={onRefresh} aria-label="Refresh the CAD feed and unit roster">
          <RefreshCw size={14} /><span>Refresh</span>
        </button>
      </div>
    </div>
  );
}