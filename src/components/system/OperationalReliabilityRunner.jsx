import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const DISPATCH_INTERVAL_MS = 2 * 60 * 1000;
const PAYROLL_CHECK_INTERVAL_MS = 60 * 1000;
const PAYROLL_CLAIM_MS = 30 * 60 * 1000;
const DISPATCH_CLAIM_MS = 90 * 1000;

const normalize = (value) => String(value || '').trim().toLowerCase();

function roleSet(user) {
  return new Set([
    normalize(user?.role),
    ...(Array.isArray(user?.additional_roles) ? user.additional_roles.map(normalize) : []),
  ].filter(Boolean));
}

function easternClock() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function claimStorageKey(key, ttlMs) {
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (Number.isFinite(last) && Date.now() - last < ttlMs) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

async function withBrowserLock(name, callback) {
  if (navigator?.locks?.request) {
    return navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return undefined;
      return callback();
    });
  }
  return callback();
}

export default function OperationalReliabilityRunner({ user }) {
  const dispatchRunning = useRef(false);
  const payrollRunning = useRef(false);
  const roles = roleSet(user);
  const canMonitorDispatch = roles.has('admin') || roles.has('dispatch') || roles.has('dispatcher')
    || roles.has('supervisor') || roles.has('cad_access') || roles.has('full_access')
    || Boolean(user?.dispatch_role);
  const canRunPayroll = roles.has('admin') || roles.has('accounting') || roles.has('full_access');

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;

    const runDispatchMonitor = async () => {
      if (!active || !canMonitorDispatch || dispatchRunning.current || document.hidden) return;
      if (!claimStorageKey('bps:auto-dispatch-monitor:last-run', DISPATCH_CLAIM_MS)) return;
      dispatchRunning.current = true;
      try {
        await withBrowserLock('bps-auto-dispatch-monitor', async () => {
          const response = await base44.functions.invoke('monitorAutoDispatchAssignments', {});
          const result = response?.data || response || {};
          if (result.error) throw new Error(result.error);
          window.dispatchEvent(new CustomEvent('bps-auto-dispatch-monitor-complete', { detail: result }));
        });
      } catch (error) {
        console.error('Automatic dispatch monitor failed:', error?.response?.data?.error || error?.message || error);
      } finally {
        dispatchRunning.current = false;
      }
    };

    const runPayrollIfDue = async () => {
      if (!active || !canRunPayroll || payrollRunning.current || document.hidden) return;
      const eastern = easternClock();
      if (eastern.hour < 8) return;
      const claimKey = `bps:scheduled-payroll:${eastern.date}`;
      if (!claimStorageKey(claimKey, PAYROLL_CLAIM_MS)) return;
      payrollRunning.current = true;
      try {
        await withBrowserLock('bps-scheduled-payroll', async () => {
          const response = await base44.functions.invoke('generateScheduledPayroll', {});
          const result = response?.data || response || {};
          if (result.error) throw new Error(result.error);
          window.dispatchEvent(new CustomEvent('bps-payroll-schedule-check-complete', { detail: result }));
        });
      } catch (error) {
        console.error('Scheduled payroll catch-up failed:', error?.response?.data?.error || error?.message || error);
      } finally {
        payrollRunning.current = false;
      }
    };

    runDispatchMonitor();
    runPayrollIfDue();
    const dispatchInterval = window.setInterval(runDispatchMonitor, DISPATCH_INTERVAL_MS);
    const payrollInterval = window.setInterval(runPayrollIfDue, PAYROLL_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        runDispatchMonitor();
        runPayrollIfDue();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      active = false;
      window.clearInterval(dispatchInterval);
      window.clearInterval(payrollInterval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [user?.id, canMonitorDispatch, canRunPayroll]);

  return null;
}
