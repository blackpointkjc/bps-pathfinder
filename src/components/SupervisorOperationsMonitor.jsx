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

export default function SupervisorOperationsMonitor({ user }) {
  const running = useRef(false);
  const pending = useRef(false);
  const timer = useRef(null);
  const lastReportQueueRefresh = useRef(0);

  useEffect(() => {
    if (!isSupervisorUser(user)) return undefined;
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
      if (!active) return;
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      try {
        await refreshReportQueue(refreshReports);
        const response = await base44.functions.invoke('syncSupervisorOperationalTasks', {});
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        window.dispatchEvent(new CustomEvent('bps-supervisor-tasks-synced', { detail: payload }));
      } catch (error) {
        console.warn('[Supervisor Operations] Task synchronization failed:', error?.message || error);
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

    schedule(250, true);
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
  }, [user?.id, user?.email, user?.role, user?.rank, user?.is_supervisor, JSON.stringify(user?.additional_roles || [])]);

  return null;
}
