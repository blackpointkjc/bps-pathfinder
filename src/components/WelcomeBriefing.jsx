import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bell, CalendarClock, Car, CheckCircle2, ChevronRight, ClipboardList, MapPin, Megaphone, MessageCircle, Radio, Shield, Sparkles, Siren, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { parseServerTimestamp } from '@/lib/easternTime';
import { getLocalReadAnnouncementIds } from '@/lib/announcementReadState';

const normalized = value => String(value || '').trim().toLowerCase();
const APP_UPDATE_TYPES = new Set(['app_update', 'system_update', 'release', 'release_notes', 'software_update', 'platform_update']);
const HIDDEN_CALL_STATUSES = new Set(['cleared', 'cancelled', 'canceled', 'closed', 'completed', 'resolved']);

function easternMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const read = type => Number(parts.find(part => part.type === type)?.value || 0);
  return (read('hour') % 24) * 60 + read('minute');
}

function shiftHasNotEnded(shift, nowMinutes = easternMinutesNow()) {
  const parse = value => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!match) return -1;
    let hour = Number(match[1]);
    const suffix = normalized(match[3]);
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return hour * 60 + Number(match[2]);
  };
  const start = parse(shift?.start_time);
  const end = parse(shift?.end_time);
  if (end < 0) return true;
  if (start >= 0 && end <= start) return true;
  return end > nowMinutes;
}

function activeAnnouncement(announcement) {
  const created = new Date(announcement?.created_date || 0).getTime();
  if (!created) return false;
  const ageDays = (Date.now() - created) / 86400000;
  if (announcement.priority === 'urgent') return ageDays <= 30;
  if (announcement.priority === 'important') return ageDays <= 14;
  return ageDays <= 7;
}

function displayName(user) {
  const last = String(user?.last_name || user?.full_name || '').trim().split(/\s+/).pop();
  const rank = String(user?.rank || '').trim();
  return [rank, last].filter(Boolean).join(' ') || user?.full_name || 'Team Member';
}

function BriefCard({ icon: Icon, label, value, detail, tone = 'blue', onClick }) {
  const toneClasses = {
    blue: 'border-blue-800/60 bg-blue-950/25 text-blue-300',
    amber: 'border-amber-800/60 bg-amber-950/25 text-amber-300',
    red: 'border-red-800/60 bg-red-950/25 text-red-300',
    emerald: 'border-emerald-800/60 bg-emerald-950/25 text-emerald-300',
    violet: 'border-violet-800/60 bg-violet-950/25 text-violet-300',
    slate: 'border-slate-700 bg-slate-900/70 text-slate-300',
  }[tone] || 'border-slate-700 bg-slate-900/70 text-slate-300';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`group min-w-0 rounded-2xl border p-3 text-left transition sm:p-4 ${toneClasses} ${onClick ? 'hover:-translate-y-0.5 hover:border-current hover:bg-opacity-40' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-black leading-none text-white">{value}</div>
          <div className="mt-1 break-words text-[11px] leading-4 text-slate-400">{detail}</div>
        </div>
        {onClick && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-white" />}
      </div>
    </Tag>
  );
}

export default function WelcomeBriefing({ user }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState({ messages: [], mentions: [], announcements: [], updates: [], appUpdates: [], tasks: [], propertyAlerts: [], liveUser: null, unit: null, shift: null, vehicle: null, override: null, allUsers: [], allUnits: [], todaySchedules: [], activeTimeEntries: [], todayVehicleAssignments: [] });
  const [dataErrors, setDataErrors] = useState([]);
  const [startingSession, setStartingSession] = useState(false);
  const [startSessionError, setStartSessionError] = useState('');
  const loadRef = useRef(() => {});
  const userKey = normalized(user?.email || user?.id);
  const storageKey = userKey ? `bps-last-active:${userKey}` : '';
  const sessionKey = userKey ? `bps-welcome-session:${userKey}` : '';
  const lastShownKey = userKey ? `bps-welcome-last-shown:${userKey}` : '';
  const lastStatusKey = userKey ? `bps-welcome-last-status:${userKey}` : '';
  const [offlineSince, setOfflineSince] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? new Date(saved).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    if (!user?.id || !user?.email || !sessionKey || !storageKey) return;
    const now = Date.now();
    const sessionSeen = sessionStorage.getItem(sessionKey) === 'acknowledged';
    const savedActive = Number.isFinite(new Date(localStorage.getItem(storageKey) || '').getTime()) ? new Date(localStorage.getItem(storageKey)).getTime() : null;

    // The login briefing is a once-per-login/browser-session window. It must not
    // reopen because the app was minimized, the tab was hidden, the user returned
    // after an hour, their duty status changed, or a component remounted.
    if (sessionSeen) return;

    localStorage.setItem(lastShownKey, new Date(now).toISOString());
    localStorage.setItem(lastStatusKey, user?.status || 'Out of Service');
    setOfflineSince(savedActive);
    let active = true;
    const load = async () => {
      const failedSources = [];
      try {
        // Load one authenticated backend snapshot instead of launching many
        // browser-side entity requests during sign-in. This keeps the briefing
        // stable under role permissions and Base44 rate limits.
        const response = await base44.functions.invoke('getWelcomeBriefingData', {});
        const snapshot = response?.data || response || {};
        if (snapshot?.error) throw new Error(snapshot.error);
        const {
          messages = [], mentions = [], announcements = [], receipts = [],
          notifications = [], propertyAlerts = [], propertyAlertReceipts = [],
          units = [], assignedTasks = [], schedules = [], vehicleAssignments = [],
          overrides = [], allUsers = [], allUnits = [], allSchedules = [],
          timeEntries = [], dispatchCalls = []
        } = snapshot;
        if (!active) return;
        const receiptIds = getLocalReadAnnouncementIds(user.email);
        (receipts || []).forEach(receipt => {
          if (receipt?.announcement_id) receiptIds.add(String(receipt.announcement_id));
        });
        const accountCreated = user.created_date ? new Date(user.created_date).getTime() : 0;
        // "Since you were away" must be based on when this user was last active,
        // not merely on an unread flag. On a first briefing for this device, keep
        // the window to the last 24 hours so old records cannot flood the popup.
        const briefingCutoff = offlineSince || Math.max(accountCreated || 0, now - 86400000);
        const createdAfterCutoff = item => {
          const created = parseServerTimestamp(item?.created_date)?.getTime() || 0;
          return created > briefingCutoff;
        };
        const canSeeSupervisorAnnouncements = user.role === 'admin' || user.additional_roles?.includes('supervisor');
        const unseenAnnouncements = (announcements || []).filter(item => (
          activeAnnouncement(item)
          && (item.audience !== 'supervisors' || canSeeSupervisorAnnouncements)
          && !receiptIds.has(item.id)
          && createdAfterCutoff(item)
        ));
        const unreadNotifications = (notifications || []).filter(item => (
          item.is_read !== true
          && item.read !== true
          && createdAfterCutoff(item)
        ));
        const appUpdates = unreadNotifications.filter(item => APP_UPDATE_TYPES.has(normalized(item.type)));
        const otherUpdates = unreadNotifications.filter(item => !APP_UPDATE_TYPES.has(normalized(item.type)));
        const pendingTasks = (assignedTasks || []).filter(item => ['open', 'in_progress'].includes(normalized(item.status)));
        const dismissedPropertyPairs = new Set((propertyAlertReceipts || []).map(item => `${item.call_id}:${item.property_id}`));
        const callById = new Map((dispatchCalls || []).map(call => [String(call.id), call]));
        const seenPropertyPairs = new Set();
        const offlineAlerts = (propertyAlerts || []).filter(item => {
          const pair = `${item.callId}:${item.propertyId}`;
          const linkedCall = callById.get(String(item.callId));
          if (!linkedCall || HIDDEN_CALL_STATUSES.has(normalized(linkedCall.status))) return false;
          if (seenPropertyPairs.has(pair) || dismissedPropertyPairs.has(pair)) return false;
          seenPropertyPairs.add(pair);
          if (!offlineSince) return true;
          const created = parseServerTimestamp(item.callTime || item.time_received || item.created_date)?.getTime() || 0;
          return created > offlineSince;
        });
        const liveUser = allUsers.find(entry => normalized(entry.email) === normalized(user.email)) || user;
        const unit = units?.[0] || null;
        const briefingMinutes = easternMinutesNow();
        const relevantUserSchedules = (schedules || []).filter(item => shiftHasNotEnded(item, briefingMinutes));
        const relevantCompanySchedules = (allSchedules || []).filter(item => shiftHasNotEnded(item, briefingMinutes));
        const shift = relevantUserSchedules.find(item => !item.is_open) || null;
        const vehicle = (vehicleAssignments || []).find(item => normalized(item.primary_officer_email) === normalized(user.email) || normalized(item.partner_officer_email) === normalized(user.email)) || null;
        const override = overrides?.[0] || null;
        const activeTimeEntries = (timeEntries || []).filter(entry => entry.clock_in && !entry.clock_out);
        setBrief({ messages: messages || [], mentions: mentions || [], announcements: unseenAnnouncements, updates: otherUpdates, appUpdates, tasks: pendingTasks, propertyAlerts: offlineAlerts, liveUser, unit, shift, vehicle, override, allUsers: allUsers || [], allUnits: allUnits || [], todaySchedules: relevantCompanySchedules, activeTimeEntries, todayVehicleAssignments: vehicleAssignments || [] });
        setDataErrors(failedSources);
      } catch (error) {
        console.error('Welcome briefing unavailable:', error);
        setDataErrors(prev => Array.from(new Set([...prev, ...failedSources, 'Briefing summary'])));
      } finally {
        if (active) {
          setLoading(false);
          setOpen(true);
        }
      }
    };
    loadRef.current = load;
    load();
    return () => { active = false; };
  }, [user?.id, user?.email, user?.status, sessionKey, storageKey, lastShownKey, lastStatusKey]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let refreshTimer = null;
    const refreshBriefing = event => {
      const task = event?.data;
      if (task?.assigned_to && String(task.assigned_to) !== String(user.id)) return;
      if (task?.status && !['open', 'in_progress'].includes(normalized(task.status))) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        loadRef.current?.();
      }, 300);
    };
    const unsubscribeTasks = base44.entities.Task.subscribe(refreshBriefing);
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribeTasks?.();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!storageKey) return;
    // Activity bookkeeping is informational only. It never reopens the briefing.
    const markActive = () => localStorage.setItem(storageKey, new Date().toISOString());
    markActive();
    const interval = window.setInterval(markActive, 60000);
    const activityEvents = ['pointerdown', 'keydown', 'touchstart'];
    activityEvents.forEach(eventName => window.addEventListener(eventName, markActive, { passive: true }));
    return () => {
      window.clearInterval(interval);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, markActive));
    };
  }, [storageKey]);

  const pendingMessages = brief.mentions.length;
  const totalItems = pendingMessages + brief.announcements.length + brief.updates.length + brief.appUpdates.length + brief.tasks.length + brief.propertyAlerts.length;
  const status = brief.unit?.status || brief.liveUser?.status || user?.status || 'Out of Service';
  const partnerName = brief.unit?.partner_name || (brief.shift?.partner_officer_email ? brief.shift.partner_officer_email : '');
  const currentCall = brief.liveUser?.current_call_info || brief.unit?.current_call_info || '';
  const vehicleLabel = brief.vehicle?.vehicle_label || '';
  const shiftDetail = brief.shift ? `${brief.shift.start_time || '--:--'}–${brief.shift.end_time || '--:--'} · ${String(brief.shift.location || '').split(':')[0] || 'Location not set'}` : '';
  const statusOverride = brief.override?.active ? (brief.override.reason || 'Administrative Out of Service override is active') : '';
  const isAdmin = user?.role === 'admin' || (user?.additional_roles || []).map(normalized).includes('full_access');
  const canOpenSupervisorTasks = isAdmin || (user?.additional_roles || []).map(normalized).includes('supervisor');
  const userByEmail = useMemo(() => new Map((brief.allUsers || []).map(person => [normalized(person.email), person])), [brief.allUsers]);
  const userById = useMemo(() => new Map((brief.allUsers || []).map(person => [String(person.id || ''), person])), [brief.allUsers]);
  const unitByEmail = useMemo(() => new Map((brief.allUnits || []).map(unitRow => [normalized(unitRow.user_email || userById.get(String(unitRow.user_id || ''))?.email), unitRow])), [brief.allUnits, userById]);
  const isCadOfficer = isOperationalOfficer;
  const activeEntryByEmail = useMemo(() => new Map((brief.activeTimeEntries || []).map(entry => [normalized(entry.officer_email), entry])), [brief.activeTimeEntries]);
  const vehicleByEmail = useMemo(() => {
    const map = new Map();
    (brief.todayVehicleAssignments || []).forEach(item => {
      if (item.primary_officer_email) map.set(normalized(item.primary_officer_email), item);
      if (item.partner_officer_email) map.set(normalized(item.partner_officer_email), item);
    });
    return map;
  }, [brief.todayVehicleAssignments]);
  const onDutyRows = useMemo(() => {
    const seen = new Set();
    return (brief.activeTimeEntries || []).map(entry => {
      const email = normalized(entry.officer_email);
      if (!email || seen.has(email)) return null;
      const person = userByEmail.get(email);
      if (person && !isCadOfficer(person)) return null;
      seen.add(email);
      const unitRow = unitByEmail.get(email);
      const vehicleRow = vehicleByEmail.get(email);
      return { email, entry, person, unit: unitRow, vehicle: vehicleRow };
    }).filter(Boolean).sort((a,b) => String(a.person?.last_name || a.email).localeCompare(String(b.person?.last_name || b.email)));
  }, [brief.activeTimeEntries, userByEmail, unitByEmail, vehicleByEmail]);
  const scheduledDutyRows = useMemo(() => {
    const rows = (brief.todaySchedules || []).filter(item => {
      if (!item.officer_email || item.officer_email === 'OPEN' || item.is_open) return false;
      const person = userByEmail.get(normalized(item.officer_email));
      return !person || isCadOfficer(person);
    });
    return rows.map(shiftRow => {
      const email = normalized(shiftRow.officer_email);
      const person = userByEmail.get(email);
      const unitRow = unitByEmail.get(email);
      const entry = activeEntryByEmail.get(email);
      const vehicleRow = vehicleByEmail.get(email);
      return { email, shift: shiftRow, person, unit: unitRow, entry, vehicle: vehicleRow };
    }).sort((a,b) => `${a.shift.start_time || ''}${a.person?.last_name || a.email}`.localeCompare(`${b.shift.start_time || ''}${b.person?.last_name || b.email}`));
  }, [brief.todaySchedules, userByEmail, unitByEmail, activeEntryByEmail, vehicleByEmail]);
  const offlineText = useMemo(() => {
    if (!offlineSince) return 'First briefing on this device';
    const minutes = Math.max(1, Math.floor((Date.now() - offlineSince) / 60000));
    if (minutes < 60) return `Away about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Away about ${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.floor(hours / 24);
    return `Away about ${days} day${days === 1 ? '' : 's'}`;
  }, [offlineSince]);

  const go = page => {
    // Navigation from inside the briefing must not acknowledge or dismiss it.
    // Keep this as SPA navigation so the briefing remains mounted and visible.
    navigate(createPageUrl(page));
  };

  const startSession = async () => {
    if (startingSession) return;
    setStartingSession(true);
    setStartSessionError('');
    try {
      const roles = new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(normalized));
      const operational = isOperationalOfficer(user)
        || roles.has('officer')
        || roles.has('supervisor')
        || roles.has('cad_access')
        || roles.has('dispatch');
      if (operational) {
        const response = await base44.functions.invoke('updateOfficerStatus', { status: 'Available' });
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        localStorage.setItem(lastStatusKey, payload.status || 'Available');
        window.dispatchEvent(new CustomEvent('bps-officer-status-changed', { detail: { status: payload.status || 'Available', source: 'welcome-briefing' } }));
      }
      sessionStorage.setItem(sessionKey, 'acknowledged');
      localStorage.setItem(storageKey, new Date().toISOString());
      setOpen(false);
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'Unable to start your Pathfinder session.';
      setStartSessionError(message);
    } finally {
      setStartingSession(false);
    }
  };

  if (!user?.id || !user?.email) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[11000] flex items-center justify-center overflow-hidden bg-black/72 p-2 backdrop-blur-md sm:p-4">
          <motion.div initial={{ opacity: 0, scale: .96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98, y: 12 }} transition={{ type: 'spring', damping: 24, stiffness: 260 }} className="flex h-[min(92dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-[#274764] bg-gradient-to-br from-[#0b1725] via-[#09131f] to-[#060c14] text-white shadow-[0_40px_120px_rgba(0,0,0,.65)]">
            <div className="relative flex-none overflow-hidden border-b border-[#21384f] px-4 py-3 sm:px-6 sm:py-4">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-amber-400/5 blur-3xl" />
              <div className="relative flex items-start gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 shadow-lg sm:h-12 sm:w-12"><Sparkles className="h-6 w-6 text-cyan-300" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Pathfinder Start-of-Session Brief</div>
                  <h1 className="mt-1 break-words text-xl font-black tracking-tight sm:text-2xl">Welcome, {displayName(user)}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1">{offlineText}</span>
                    <span className={`rounded-full border px-2.5 py-1 font-black ${status === 'Available' ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' : status === 'Out of Service' ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-blue-700/60 bg-blue-950/40 text-blue-300'}`}>STATUS: {String(status).toUpperCase()}</span>
                  </div>
                </div>

              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
              {loading ? (
                <div className="flex min-h-52 items-center justify-center"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"/><p className="mt-3 text-xs font-bold tracking-widest text-slate-500">BUILDING YOUR BRIEFING…</p></div></div>
              ) : (
                <>
                  {dataErrors.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-700/60 bg-amber-950/25 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                      <div className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-amber-200">
                        Some briefing data could not be loaded and may be showing as empty or incomplete: {dataErrors.join(', ')}.
                      </div>
                      <button type="button" onClick={() => loadRef.current?.()} className="shrink-0 rounded-lg border border-amber-500/60 bg-amber-900/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-900/70">Retry</button>
                    </div>
                  )}
                  <div className="rounded-2xl border border-cyan-900/60 bg-gradient-to-r from-cyan-950/20 to-blue-950/20 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2"><Radio className="h-4 w-4 text-cyan-300"/><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Duty Status Snapshot</div><span className={`ml-auto rounded-full border px-2.5 py-1 text-[10px] font-black ${status === 'Available' ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300' : status === 'Out of Service' ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-blue-700/60 bg-blue-950/50 text-blue-300'}`}>{String(status).toUpperCase()}</span></div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500"><Shield className="h-3.5 w-3.5"/>CAD Status</div><div className="mt-1 text-sm font-black text-white">{status}</div><div className="mt-1 text-[10px] text-slate-400">{currentCall ? `Assigned: ${currentCall}` : 'No active CAD call assignment'}</div></div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500"><Users className="h-3.5 w-3.5"/>Partner / Team</div><div className="mt-1 truncate text-sm font-black text-white">{partnerName || 'No partner assigned'}</div><div className="mt-1 text-[10px] text-slate-400">{brief.unit?.union_id ? 'CAD team union active' : brief.shift?.partner_officer_email ? 'Scheduled partner' : 'Operating solo'}</div></div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500"><Car className="h-3.5 w-3.5"/>Fleet Vehicle</div><div className="mt-1 text-sm font-black text-white">{vehicleLabel || 'Not assigned'}</div><div className="mt-1 text-[10px] text-slate-400">{brief.vehicle ? `${brief.vehicle.start_time || ''}-${brief.vehicle.end_time || ''}` : 'No vehicle assignment for today'}</div></div>
                      <div className={`rounded-xl border p-3 ${statusOverride ? 'border-red-800/70 bg-red-950/25' : 'border-slate-800 bg-slate-950/60'}`}><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500"><AlertTriangle className="h-3.5 w-3.5"/>Status Control</div><div className={`mt-1 text-sm font-black ${statusOverride ? 'text-red-300' : 'text-white'}`}>{statusOverride ? 'Override Active' : 'Normal'}</div><div className="mt-1 text-[10px] text-slate-400">{statusOverride || 'No forced status override'}</div></div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/45 p-3"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-blue-300"/><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Today's Schedule</div><div className="mt-1 text-xs font-bold text-white">{shiftDetail || 'No published shift found for today'}</div></div></div>
                      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/45 p-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Current Assignment</div><div className="mt-1 text-xs font-bold text-white">{currentCall || (brief.shift?.location ? String(brief.shift.location).split(':')[0] : 'No current assignment')}</div></div></div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/10 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-300"/>
                      <div className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">{isAdmin ? 'Today’s Staffing & On-Duty Status' : 'Who’s On Duty'}</div>
                      <span className="ml-auto rounded-full border border-emerald-800/60 bg-emerald-950/50 px-2.5 py-1 text-[10px] font-black text-emerald-300">{onDutyRows.length} CLOCKED IN</span>
                    </div>

                    {isAdmin ? (
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                        <div className="hidden grid-cols-[1.35fr_.8fr_1fr_.8fr_.9fr_.9fr] gap-2 bg-slate-900/90 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-500 md:grid">
                          <div>Officer</div><div>Scheduled</div><div>Location</div><div>Clock</div><div>CAD Status</div><div>Vehicle / Partner</div>
                        </div>
                        <div className="max-h-64 divide-y divide-slate-800 overflow-y-auto">
                          {scheduledDutyRows.length === 0 ? <div className="p-4 text-center text-xs text-slate-500">No officers are scheduled today.</div> : scheduledDutyRows.map(row => {
                            const name = row.person ? `${row.person.rank || 'Officer'} ${row.person.last_name || row.person.first_name || ''}`.trim() : row.email;
                            const location = String(row.shift.location || '').split(':')[0] || '—';
                            const liveStatus = row.unit?.status || row.person?.status || 'Out of Service';
                            return <div key={`${row.shift.id}-${row.email}`} className="grid gap-2 bg-slate-950/45 p-3 text-xs md:grid-cols-[1.35fr_.8fr_1fr_.8fr_.9fr_.9fr] md:items-center">
                              <div className="min-w-0"><div className="truncate font-black text-white">{name}</div><div className="mt-0.5 text-[9px] text-slate-500">{row.person?.unit_number ? `UNIT-${row.person.unit_number}` : row.email}</div></div>
                              <div><span className="mr-2 text-[8px] font-black uppercase text-slate-600 md:hidden">Scheduled</span><span className="font-bold text-slate-200">{row.shift.start_time}-{row.shift.end_time}</span></div>
                              <div className="min-w-0"><span className="mr-2 text-[8px] font-black uppercase text-slate-600 md:hidden">Location</span><span className="break-words text-slate-300">{location}</span></div>
                              <div><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${row.entry ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>{row.entry ? 'CLOCKED IN' : 'NOT CLOCKED IN'}</span>{row.entry?.clock_in && <div className="mt-1 text-[9px] text-slate-500">Since {new Date(row.entry.clock_in).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>}</div>
                              <div><span className="mr-2 text-[8px] font-black uppercase text-slate-600 md:hidden">CAD</span><span className="font-bold text-blue-300">{liveStatus}</span>{row.unit?.current_call_info && <div className="mt-0.5 line-clamp-1 text-[9px] text-slate-500">{row.unit.current_call_info}</div>}</div>
                              <div className="min-w-0"><div className="truncate font-bold text-amber-300">{row.vehicle?.vehicle_label || 'No vehicle'}</div><div className="mt-0.5 truncate text-[9px] text-blue-300">{row.unit?.partner_name || (row.shift.partner_officer_email ? `Partner: ${row.shift.partner_officer_email}` : 'No partner')}</div></div>
                            </div>;
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {onDutyRows.length === 0 ? <div className="col-span-full rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">No CAD officers are currently clocked in.</div> : onDutyRows.map(row => {
                          const name = row.person ? `${row.person.rank || 'Officer'} ${row.person.last_name || row.person.first_name || ''}`.trim() : row.email;
                          const liveStatus = row.unit?.status || row.person?.status || 'On Duty';
                          return <div key={row.email} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                            <div className="flex items-start gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.45)]"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-white">{name}</div><div className="mt-0.5 text-[9px] font-bold text-blue-300">{liveStatus}</div></div></div>
                            <div className="mt-2 text-[10px] text-slate-400">{row.entry?.location || row.unit?.current_call_info || 'On duty'}</div>
                            {(row.unit?.partner_name || row.vehicle?.vehicle_label) && <div className="mt-2 flex flex-wrap gap-1.5">{row.unit?.partner_name && <span className="rounded border border-blue-800/50 bg-blue-950/30 px-1.5 py-0.5 text-[9px] text-blue-300">w/ {row.unit.partner_name}</span>}{row.vehicle?.vehicle_label && <span className="rounded border border-amber-800/50 bg-amber-950/30 px-1.5 py-0.5 text-[9px] text-amber-300">{row.vehicle.vehicle_label}</span>}</div>}
                          </div>;
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
                    <BriefCard icon={MessageCircle} label="Teams Messages" value={pendingMessages} detail={pendingMessages ? 'Unread Teams chat mentions' : 'Open Inbox for your Microsoft Teams conversations'} tone="blue" onClick={() => go('OfficerInbox')} />
                    <BriefCard icon={Megaphone} label="Announcements" value={brief.announcements.length} detail={brief.announcements.length ? 'Announcements you have not opened yet' : 'No unseen announcements'} tone="amber" onClick={() => go('Announcements')} />
                    {brief.appUpdates.length > 0 && <BriefCard icon={Sparkles} label="App Updates" value={brief.appUpdates.length} detail="Unread platform or software update records" tone="violet" />}
                    <BriefCard icon={ClipboardList} label="Assigned Tasks" value={brief.tasks.length} detail={brief.tasks.length ? 'Open tasks currently assigned to you' : 'No open assigned tasks'} tone={brief.tasks.length ? 'amber' : 'emerald'} onClick={canOpenSupervisorTasks ? () => go('SupervisorTasks') : undefined} />
                    {brief.updates.length > 0 && <BriefCard icon={Bell} label="Other Updates" value={brief.updates.length} detail="Unread account, schedule, or system notification records" tone="blue" />}
                    <BriefCard icon={Siren} label="Property Calls While Away" value={brief.propertyAlerts.length} detail={brief.propertyAlerts.length ? 'Monitored-property calls since your last session' : 'No property alerts while away'} tone={brief.propertyAlerts.length ? 'red' : 'emerald'} onClick={() => go('DispatchCenter')} />
                  </div>

                  {(brief.appUpdates.length > 0 || brief.updates.length > 0 || brief.announcements.length > 0 || brief.tasks.length > 0) && <div className="mt-4 rounded-2xl border border-violet-900/50 bg-violet-950/10 p-3 sm:p-4">
                    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300"/><div className="text-xs font-black uppercase tracking-[.16em] text-violet-200">Updates Since You Were Away</div></div>
                    <div className="mt-2 space-y-2">
                      {[...brief.appUpdates, ...brief.updates].slice(0, 4).map(item => <div key={`update-${item.id}`} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="text-xs font-black text-white">{item.title || item.type || 'System Update'}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{item.message || item.description || 'A new update is available in Pathfinder.'}</div></div>)}
                      {brief.announcements.slice(0, 2).map(item => <button key={`announcement-${item.id}`} type="button" onClick={() => go('Announcements')} className="w-full rounded-xl border border-amber-900/50 bg-amber-950/15 p-3 text-left"><div className="text-xs font-black text-amber-200">{item.title || 'Company Announcement'}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{item.message || 'Open Announcements to review.'}</div></button>)}
                      {brief.tasks.slice(0, 4).map(item => <button key={`task-${item.id}`} type="button" onClick={canOpenSupervisorTasks ? () => go('SupervisorTasks') : undefined} disabled={!canOpenSupervisorTasks} className="w-full rounded-xl border border-amber-900/50 bg-amber-950/15 p-3 text-left disabled:cursor-default"><div className="text-xs font-black text-amber-200">{item.title || 'Assigned Task'}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{item.description || item.notes || 'Open Action Items to review this task.'}</div></button>)}
                    </div>
                  </div>}

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-black/15 p-3 sm:p-4">
                    <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-cyan-300"/><div className="text-xs font-black uppercase tracking-[.16em] text-slate-300">Session Summary</div></div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{totalItems ? `You have ${totalItems} item${totalItems === 1 ? '' : 's'} needing your attention from Teams mentions, announcements, assigned tasks, verified notifications, or monitored-property activity.` : 'You are fully caught up. No unread Teams mentions, unseen announcements, assigned tasks, verified notifications, or monitored-property calls were found for this session.'}</p>
                    {brief.propertyAlerts.slice(0, 3).map(alert => (
                      <button key={alert.id} type="button" onClick={() => go('DispatchCenter')} className="mt-2 flex w-full items-start gap-3 rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-left hover:bg-red-950/35">
                        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-red-300"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-white">{alert.propertyName || 'Monitored Property'} · {alert.callIncident || 'Call for service'}</div><div className="mt-1 break-words text-[10px] text-slate-400">{alert.callLocation || alert.description || 'Location unavailable'}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-600"/>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex-none border-t border-[#21384f] bg-[#07111c]/95 px-3 py-2.5 sm:px-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><CheckCircle2 className="h-3.5 w-3.5"/><span>Review your briefing, then acknowledge it to start your session.</span></div>
                <div className="sm:ml-auto flex gap-2">
                  <button type="button" onClick={() => go('OfficerInbox')} disabled={startingSession} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-700/60 bg-blue-950/30 px-4 text-xs font-black text-blue-200 hover:bg-blue-900/40 disabled:opacity-50 sm:flex-none"><MessageCircle className="h-4 w-4"/>INBOX</button>
                  <button type="button" onClick={startSession} disabled={startingSession} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 text-xs font-black text-white shadow-lg hover:from-cyan-500 hover:to-blue-500 disabled:cursor-wait disabled:opacity-70 sm:flex-none">{startingSession ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>STARTING…</> : <><CheckCircle2 className="h-4 w-4"/>START SESSION</>}</button>
                </div>
              </div>
              {startSessionError && <div className="mt-2 rounded-lg border border-red-700/60 bg-red-950/40 px-3 py-2 text-[11px] font-bold text-red-200">{startSessionError}</div>}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><motion.div className="h-full origin-left bg-gradient-to-r from-cyan-400 to-blue-500" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 30, ease: 'linear' }} /></div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
