import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const lower = value => String(value || '').trim().toLowerCase();
const SUPERVISORY_RANKS = new Set(['sergeant','lieutenant','lt colonel','lieutenant colonel','captain','major','colonel']);
const isSupervisorUser = user => {
  const roles = new Set((user?.additional_roles || []).map(lower));
  return Boolean(user) && (
    user.role === 'admin'
    || lower(user.role) === 'supervisor'
    || user.is_supervisor === true
    || roles.has('supervisor')
    || roles.has('full_access')
    || SUPERVISORY_RANKS.has(lower(user.rank))
  );
};

export default function SupervisorOperationsMonitor({ user, enabled = true }) {
  const running = useRef(false);
  const pending = useRef(false);
  const timer = useRef(null);
  const lastReportQueueRefresh = useRef(0);
  const authBackoffUntil = useRef(0);

  useEffect(() => {
    if (!enabled || !isSupervisorUser(user)) return undefined;
    let active = true;
    const unsubscribers = [];

    const refreshReportQueue = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastReportQueueRefresh.current < 5 * 60 * 1000) return;
      lastReportQueueRefresh.current = now;
      try {
        await base44.functions.invoke('getRoleWorkQueue', { queue_role: 'supervisor_reports' });
      } catch (error) {
        console.warn('[Supervisor Operations] Report review queue refresh failed:', error?.message || error);
      }
    };

    const run = async ({ refreshReports = false } = {}) => {
      if (!active || Date.now() < authBackoffUntil.current || document.visibilityState !== 'visible') return;
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      try {
        // Verify the authenticated session before starting the expensive multi-table
        // supervisor reconciliation. During login/preview transitions the UI can
        // still hold the previous user object for a moment even though function auth
        // is not ready yet; skip that window instead of generating repeated 401s.
        const authenticated = await base44.auth.me().catch(() => null);
        if (!authenticated?.id) {
          authBackoffUntil.current = Date.now() + 5 * 60 * 1000;
          return;
        }
        await refreshReportQueue(refreshReports);
        const response = await base44.functions.invoke('syncSupervisorOperationalTasks', {});
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        window.dispatchEvent(new CustomEvent('bps-supervisor-tasks-synced', { detail: payload }));
      } catch (error) {
        const message = String(error?.message || error || '');
        const status = Number(error?.response?.status || error?.status || 0);
        if (status === 401 || /unauthorized/i.test(message)) authBackoffUntil.current = Date.now() + 5 * 60 * 1000;
        console.warn('[Supervisor Operations] Task synchronization failed:', message);
      } finally {
        running.current = false;
        if (pending.current && active) {
          pending.current = false;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(run, 1200);
        }
      }
    };

    const schedule = (delay = 700, refreshReports = false) => {
      if (!active) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => run({ refreshReports }), delay);
    };

    // Realtime subscriptions are installed immediately below, but the expensive
    // multi-table reconciliation must not compete with CAD/location during the
    // first paint. Emergency source changes still schedule a near-immediate run.
    schedule(8000, false);
    const reportStartupTimer = window.setTimeout(() => schedule(250, true), 30000);
    const interval = window.setInterval(run, 60000);

    const reportEntities = new Set([
      'DailyActivityReport','ShiftReport','IncidentReport','TrespassingNotice','ParkingViolation',
      'CriminalComplaint','DispatcherShiftReport','UseOfForceReport','ConfidentialReport','MaintenanceReport','OpenDoorReport',
    ]);

    for (const entity of [
      'Schedule',
      'TimeEntry',
      'DailyActivityReport',
      'Complaint',
      'WriteUpReport',
      'PerformanceReview',
      'InspectionReport',
      'ShiftReport',
      'IncidentReport',
      'TrespassingNotice',
      'ParkingViolation',
      'CriminalComplaint',
      'DispatcherShiftReport',
      'UseOfForceReport',
      'ConfidentialReport',
      'MaintenanceReport',
      'OpenDoorReport',
    ]) {
      try {
        const unsubscribe = base44.entities[entity].subscribe(() => schedule(700, reportEntities.has(entity)));
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch (error) {
        console.warn(`[Supervisor Operations] Realtime unavailable for ${entity}:`, error?.message || error);
      }
    }

    const resume = () => schedule(200);
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule(100); };
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('bps-operational-resume', resume);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(reportStartupTimer);
      window.clearTimeout(timer.current);
      unsubscribers.forEach(unsubscribe => {
        try { unsubscribe(); } catch {}
      });
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('bps-operational-resume', resume);
    };
  }, [enabled, user?.id, user?.email, user?.role, user?.rank, user?.is_supervisor, JSON.stringify(user?.additional_roles || [])]);

  return null;
}
