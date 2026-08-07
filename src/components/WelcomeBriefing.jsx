import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCircle2, ChevronRight, Clock3, Megaphone, MessageCircle, Radio, Shield, Sparkles, Siren, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';

const normalized = value => String(value || '').trim().toLowerCase();
const APP_UPDATE_TYPES = new Set(['app_update', 'system_update', 'release', 'release_notes', 'software_update', 'platform_update']);

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
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState({ messages: [], mentions: [], announcements: [], updates: [], appUpdates: [], propertyAlerts: [] });
  const userKey = normalized(user?.email || user?.id);
  const storageKey = userKey ? `bps-last-active:${userKey}` : '';
  const [offlineSince] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return null;
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? new Date(saved).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    if (!user?.id || !user?.email) return;
    let active = true;
    const load = async () => {
      try {
        const [messages, mentions, announcements, receipts, notifications, propertyAlerts] = await Promise.all([
          base44.entities.Message.filter({ recipient_id: user.id, read: false }, '-created_date', 200).catch(() => []),
          base44.entities.ChatMention.filter({ recipient_email: user.email, read: false }, '-created_date', 200).catch(() => []),
          base44.entities.Announcement.list('-created_date', 100).catch(() => []),
          base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 500).catch(() => []),
          base44.entities.Notification.filter({ recipient_email: user.email }, '-created_date', 200).catch(() => []),
          base44.entities.PropertyAlert.list('-created_date', 300).catch(() => []),
        ]);
        if (!active) return;
        const receiptIds = new Set((receipts || []).map(item => item.announcement_id));
        const accountCreated = user.created_date ? new Date(user.created_date).getTime() : 0;
        const unseenAnnouncements = (announcements || []).filter(item => {
          const created = new Date(item.created_date || 0).getTime();
          return activeAnnouncement(item) && !receiptIds.has(item.id) && (!accountCreated || created >= accountCreated);
        });
        const unreadNotifications = (notifications || []).filter(item => item.is_read !== true && item.read !== true);
        const appUpdates = unreadNotifications.filter(item => APP_UPDATE_TYPES.has(normalized(item.type)));
        const otherUpdates = unreadNotifications.filter(item => !APP_UPDATE_TYPES.has(normalized(item.type)));
        const offlineAlerts = (propertyAlerts || []).filter(item => {
          if (!offlineSince) return item.acknowledged !== true;
          return new Date(item.created_date || 0).getTime() > offlineSince;
        });
        setBrief({ messages: messages || [], mentions: mentions || [], announcements: unseenAnnouncements, updates: otherUpdates, appUpdates, propertyAlerts: offlineAlerts });
      } catch (error) {
        console.warn('Welcome briefing unavailable:', error?.message);
      } finally {
        if (active) {
          setLoading(false);
          setOpen(true);
          setSeconds(30);
        }
      }
    };
    load();
    return () => { active = false; };
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setSeconds(value => value <= 1 ? 0 : value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open && seconds === 0) setOpen(false);
  }, [open, seconds]);

  useEffect(() => {
    if (!storageKey) return;
    const markActive = () => localStorage.setItem(storageKey, new Date().toISOString());
    markActive();
    const interval = window.setInterval(markActive, 60000);
    const onVisibility = () => { if (document.hidden) markActive(); };
    window.addEventListener('beforeunload', markActive);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      markActive();
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', markActive);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [storageKey]);

  const pendingMessages = brief.messages.length + brief.mentions.length;
  const totalItems = pendingMessages + brief.announcements.length + brief.updates.length + brief.appUpdates.length + brief.propertyAlerts.length;
  const status = user?.status || 'Out of Service';
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
    setOpen(false);
    window.location.href = createPageUrl(page);
  };

  if (!user?.id || !user?.email) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/72 p-2 backdrop-blur-md sm:p-5">
          <motion.div initial={{ opacity: 0, scale: .96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98, y: 12 }} transition={{ type: 'spring', damping: 24, stiffness: 260 }} className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[#274764] bg-gradient-to-br from-[#0b1725] via-[#09131f] to-[#060c14] text-white shadow-[0_40px_120px_rgba(0,0,0,.65)]">
            <div className="relative overflow-hidden border-b border-[#21384f] px-4 py-5 sm:px-6 sm:py-6">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-amber-400/5 blur-3xl" />
              <div className="relative flex items-start gap-3 sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 shadow-lg sm:h-14 sm:w-14"><Sparkles className="h-6 w-6 text-cyan-300" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Pathfinder Start-of-Session Brief</div>
                  <h1 className="mt-1 break-words text-2xl font-black tracking-tight sm:text-3xl">Welcome, {displayName(user)}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1">{offlineText}</span>
                    <span className={`rounded-full border px-2.5 py-1 font-black ${status === 'Available' ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' : status === 'Out of Service' ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-blue-700/60 bg-blue-950/40 text-blue-300'}`}>STATUS: {String(status).toUpperCase()}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close welcome briefing"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
              {loading ? (
                <div className="flex min-h-52 items-center justify-center"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"/><p className="mt-3 text-xs font-bold tracking-widest text-slate-500">BUILDING YOUR BRIEFING…</p></div></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
                    <BriefCard icon={Shield} label="Current Status" value={status === 'Out of Service' ? 'OOS' : status} detail="Your live CAD duty status" tone={status === 'Available' ? 'emerald' : 'slate'} />
                    <BriefCard icon={MessageCircle} label="Pending Messages" value={pendingMessages} detail={pendingMessages ? 'Unread direct messages or mentions' : 'You are caught up'} tone="blue" onClick={() => go('OfficerInbox')} />
                    <BriefCard icon={Megaphone} label="Announcements" value={brief.announcements.length} detail={brief.announcements.length ? 'Announcements you have not opened yet' : 'No unseen announcements'} tone="amber" onClick={() => go('Announcements')} />
                    <BriefCard icon={Sparkles} label="App Updates" value={brief.appUpdates.length} detail={brief.appUpdates.length ? 'Unread platform or software updates' : 'No new app updates'} tone="violet" />
                    <BriefCard icon={Bell} label="Other Updates" value={brief.updates.length} detail={brief.updates.length ? 'Unread account, schedule, or system updates' : 'No other pending updates'} tone="blue" />
                    <BriefCard icon={Siren} label="Property Calls While Away" value={brief.propertyAlerts.length} detail={brief.propertyAlerts.length ? 'Monitored-property calls since your last session' : 'No property alerts while away'} tone={brief.propertyAlerts.length ? 'red' : 'emerald'} onClick={() => go('DispatchCenter')} />
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-black/15 p-3 sm:p-4">
                    <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-cyan-300"/><div className="text-xs font-black uppercase tracking-[.16em] text-slate-300">Session Summary</div></div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{totalItems ? `You have ${totalItems} item${totalItems === 1 ? '' : 's'} needing your attention from messages, announcements, system updates, or monitored-property activity.` : 'You are fully caught up. No unread messages, unseen announcements, new app updates, or monitored-property calls were found for this session.'}</p>
                    {brief.propertyAlerts.slice(0, 3).map(alert => (
                      <button key={alert.id} type="button" onClick={() => go('DispatchCenter')} className="mt-2 flex w-full items-start gap-3 rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-left hover:bg-red-950/35">
                        <Siren className="mt-0.5 h-4 w-4 shrink-0 text-red-300"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-white">{alert.propertyName || 'Monitored Property'} · {alert.callIncident || 'Call for service'}</div><div className="mt-1 break-words text-[10px] text-slate-400">{alert.callLocation || alert.description || 'Location unavailable'}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-600"/>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-[#21384f] bg-[#07111c]/90 px-3 py-3 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><Clock3 className="h-3.5 w-3.5"/><span>Brief closes automatically in <span className="text-white">{seconds}s</span></span></div>
                <div className="sm:ml-auto flex gap-2">
                  <button type="button" onClick={() => go('OfficerInbox')} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-700/60 bg-blue-950/30 px-4 text-xs font-black text-blue-200 hover:bg-blue-900/40 sm:flex-none"><MessageCircle className="h-4 w-4"/>INBOX</button>
                  <button type="button" onClick={() => setOpen(false)} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 text-xs font-black text-white shadow-lg hover:from-cyan-500 hover:to-blue-500 sm:flex-none"><CheckCircle2 className="h-4 w-4"/>START SESSION</button>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><motion.div className="h-full origin-left bg-gradient-to-r from-cyan-400 to-blue-500" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 30, ease: 'linear' }} /></div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
